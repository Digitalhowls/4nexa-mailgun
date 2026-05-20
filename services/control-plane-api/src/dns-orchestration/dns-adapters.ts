/**
 * DNS Provider Adapters
 *
 * Implementación real de las llamadas HTTP a cada proveedor DNS soportado.
 * Cada adaptador toma las credenciales ya descifradas y crea/verifica registros DNS.
 *
 * Proveedores: CLOUDFLARE | HETZNER | OVH | ROUTE53 | POWERDNS | MANUAL
 */

export interface DnsRecord {
  type: string;
  name: string;
  value: string;
  ttl?: number;
}

export interface DnsProviderCredentials {
  apiKey: string;
  apiSecret?: string;
  zoneId?: string;
}

export interface DnsProviderAdapter {
  createRecord(creds: DnsProviderCredentials, record: DnsRecord): Promise<void>;
  deleteRecord(creds: DnsProviderCredentials, record: DnsRecord): Promise<void>;
  listRecords(creds: DnsProviderCredentials, name: string, type: string): Promise<DnsRecord[]>;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function httpJson<T>(
  url: string,
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH',
  headers: Record<string, string>,
  body?: unknown,
): Promise<T> {
  const res = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json', ...headers },
    body: body !== undefined ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(15_000),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '(sin cuerpo)');
    throw new Error(`HTTP ${res.status} ${res.statusText}: ${text}`);
  }

  const ct = res.headers.get('content-type') ?? '';
  if (!ct.includes('application/json')) return undefined as T;
  return res.json() as Promise<T>;
}

// ---------------------------------------------------------------------------
// Cloudflare DNS API v4
// https://developers.cloudflare.com/api/operations/dns-records-for-a-zone-create-dns-record
// ---------------------------------------------------------------------------
export const CloudflareAdapter: DnsProviderAdapter = {
  async createRecord(creds, record) {
    const zoneId = creds.zoneId;
    if (!zoneId) throw new Error('Cloudflare requiere zoneId');

    await httpJson<unknown>(
      `https://api.cloudflare.com/client/v4/zones/${zoneId}/dns_records`,
      'POST',
      { Authorization: `Bearer ${creds.apiKey}` },
      {
        type: record.type,
        name: record.name,
        content: record.value,
        ttl: record.ttl ?? 3600,
        proxied: false,
      },
    );
  },

  async deleteRecord(creds, record) {
    const zoneId = creds.zoneId;
    if (!zoneId) throw new Error('Cloudflare requiere zoneId');

    // Buscar el ID del registro primero
    const existing = await CloudflareAdapter.listRecords(creds, record.name, record.type);
    for (const r of existing as Array<DnsRecord & { _id?: string }>) {
      if (r._id) {
        await httpJson<unknown>(
          `https://api.cloudflare.com/client/v4/zones/${zoneId}/dns_records/${r._id}`,
          'DELETE',
          { Authorization: `Bearer ${creds.apiKey}` },
        );
      }
    }
  },

  async listRecords(creds, name, type) {
    const zoneId = creds.zoneId;
    if (!zoneId) throw new Error('Cloudflare requiere zoneId');

    const params = new URLSearchParams({ name, type });
    const res = await httpJson<{ result: Array<{ id: string; type: string; name: string; content: string; ttl: number }> }>(
      `https://api.cloudflare.com/client/v4/zones/${zoneId}/dns_records?${params}`,
      'GET',
      { Authorization: `Bearer ${creds.apiKey}` },
    );

    return (res?.result ?? []).map((r) => ({
      type: r.type,
      name: r.name,
      value: r.content,
      ttl: r.ttl,
      _id: r.id,
    } as DnsRecord));
  },
};

// ---------------------------------------------------------------------------
// Hetzner DNS API
// https://dns.hetzner.com/api-docs
// ---------------------------------------------------------------------------
export const HetznerAdapter: DnsProviderAdapter = {
  async createRecord(creds, record) {
    const zoneId = creds.zoneId;
    if (!zoneId) throw new Error('Hetzner requiere zoneId');

    await httpJson<unknown>(
      'https://dns.hetzner.com/api/v1/records',
      'POST',
      { 'Auth-API-Token': creds.apiKey },
      {
        zone_id: zoneId,
        type: record.type,
        name: record.name,
        value: record.value,
        ttl: record.ttl ?? 3600,
      },
    );
  },

  async deleteRecord(creds, record) {
    const existing = await HetznerAdapter.listRecords(creds, record.name, record.type);
    for (const r of existing as Array<DnsRecord & { _id?: string }>) {
      if (r._id) {
        await httpJson<unknown>(
          `https://dns.hetzner.com/api/v1/records/${r._id}`,
          'DELETE',
          { 'Auth-API-Token': creds.apiKey },
        );
      }
    }
  },

  async listRecords(creds, name, type) {
    const zoneId = creds.zoneId;
    if (!zoneId) throw new Error('Hetzner requiere zoneId');

    const params = new URLSearchParams({ zone_id: zoneId });
    const res = await httpJson<{ records: Array<{ id: string; type: string; name: string; value: string; ttl: number }> }>(
      `https://dns.hetzner.com/api/v1/records?${params}`,
      'GET',
      { 'Auth-API-Token': creds.apiKey },
    );

    return (res?.records ?? [])
      .filter((r) => r.name === name && r.type === type)
      .map((r) => ({ type: r.type, name: r.name, value: r.value, ttl: r.ttl, _id: r.id } as DnsRecord));
  },
};

// ---------------------------------------------------------------------------
// OVH DNS API
// https://api.ovh.com/console/#/domain
// Uses Application Key + Application Secret + Consumer Key
// apiKey = applicationKey, apiSecret = consumerKey, zoneId = zoneName
// ---------------------------------------------------------------------------
export const OvhAdapter: DnsProviderAdapter = {
  async createRecord(creds, record) {
    const zone = creds.zoneId;
    if (!zone) throw new Error('OVH requiere zoneId (nombre de zona)');
    if (!creds.apiSecret) throw new Error('OVH requiere apiSecret (consumerKey)');

    const timestamp = Math.floor(Date.now() / 1000);
    const url = `https://eu.api.ovh.com/1.0/domain/zone/${zone}/record`;

    // OVH firma las peticiones con HMAC-SHA1
    const { createHmac } = await import('crypto');
    const body = JSON.stringify({
      fieldType: record.type,
      subDomain: record.name.replace(`.${zone}`, '').replace(zone, ''),
      target: record.value,
      ttl: record.ttl ?? 3600,
    });

    const sig = `$1$${createHmac('sha1', creds.apiSecret)
      .update(`${creds.apiKey}+${creds.apiSecret}++${timestamp}+POST+${url}+${body}`)
      .digest('hex')}`;

    await httpJson<unknown>(url, 'POST', {
      'X-Ovh-Application': creds.apiKey,
      'X-Ovh-Consumer': creds.apiSecret,
      'X-Ovh-Timestamp': String(timestamp),
      'X-Ovh-Signature': sig,
    }, JSON.parse(body));
  },

  async deleteRecord(creds, record) {
    const existing = await OvhAdapter.listRecords(creds, record.name, record.type);
    for (const r of existing as Array<DnsRecord & { _id?: string }>) {
      if (!r._id) continue;
      const zone = creds.zoneId;
      const timestamp = Math.floor(Date.now() / 1000);
      const { createHmac } = await import('crypto');
      const url = `https://eu.api.ovh.com/1.0/domain/zone/${zone}/record/${r._id}`;
      const sig = `$1$${createHmac('sha1', creds.apiSecret ?? '')
        .update(`${creds.apiKey}+${creds.apiSecret ?? ''}++${timestamp}+DELETE+${url}+`)
        .digest('hex')}`;
      await httpJson<unknown>(url, 'DELETE', {
        'X-Ovh-Application': creds.apiKey,
        'X-Ovh-Consumer': creds.apiSecret ?? '',
        'X-Ovh-Timestamp': String(timestamp),
        'X-Ovh-Signature': sig,
      });
    }
  },

  async listRecords(creds, name, type) {
    const zone = creds.zoneId;
    if (!zone) throw new Error('OVH requiere zoneId');
    if (!creds.apiSecret) throw new Error('OVH requiere apiSecret');

    const timestamp = Math.floor(Date.now() / 1000);
    const subDomain = name.replace(`.${zone}`, '').replace(zone, '');
    const url = `https://eu.api.ovh.com/1.0/domain/zone/${zone}/record?fieldType=${type}&subDomain=${subDomain}`;

    const { createHmac } = await import('crypto');
    const sig = `$1$${createHmac('sha1', creds.apiSecret)
      .update(`${creds.apiKey}+${creds.apiSecret}++${timestamp}+GET+${url}+`)
      .digest('hex')}`;

    const ids = await httpJson<number[]>(url as string, 'GET', {
      'X-Ovh-Application': creds.apiKey,
      'X-Ovh-Consumer': creds.apiSecret,
      'X-Ovh-Timestamp': String(timestamp),
      'X-Ovh-Signature': sig,
    });

    return (ids ?? []).map((id) => ({
      type,
      name,
      value: '',
      _id: String(id),
    } as DnsRecord));
  },
};

// ---------------------------------------------------------------------------
// AWS Route53
// https://docs.aws.amazon.com/Route53/latest/APIReference/API_ChangeResourceRecordSets.html
// apiKey = accessKeyId, apiSecret = secretAccessKey, zoneId = hostedZoneId
// ---------------------------------------------------------------------------

async function route53SignedHeaders(
  creds: DnsProviderCredentials,
  method: string,
  url: string,
  body: string,
): Promise<Record<string, string>> {
  const { createHmac, createHash } = await import('crypto');

  const parsed = new URL(url);
  const now = new Date();
  const datestamp = now.toISOString().replace(/[-:]/g, '').split('.')[0];
  const dateOnly = datestamp.slice(0, 8);

  const region = 'us-east-1';
  const service = 'route53';

  const contentHash = createHash('sha256').update(body).digest('hex');
  const canonicalHeaders = `host:${parsed.hostname}\nx-amz-content-sha256:${contentHash}\nx-amz-date:${datestamp}\n`;
  const signedHeaders = 'host;x-amz-content-sha256;x-amz-date';

  const canonicalRequest = [
    method,
    parsed.pathname,
    parsed.search.slice(1),
    canonicalHeaders,
    signedHeaders,
    contentHash,
  ].join('\n');

  const credentialScope = `${dateOnly}/${region}/${service}/aws4_request`;
  const stringToSign = `AWS4-HMAC-SHA256\n${datestamp}\n${credentialScope}\n${createHash('sha256').update(canonicalRequest).digest('hex')}`;

  const signingKey = [dateOnly, region, service, 'aws4_request'].reduce(
    (prev, cur) => createHmac('sha256', prev).update(cur).digest(),
    Buffer.from(`AWS4${creds.apiSecret ?? ''}`) as Buffer,
  );

  const signature = createHmac('sha256', signingKey).update(stringToSign).digest('hex');

  return {
    'Content-Type': 'text/xml',
    'x-amz-date': datestamp,
    'x-amz-content-sha256': contentHash,
    Authorization: `AWS4-HMAC-SHA256 Credential=${creds.apiKey}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
  };
}

async function route53Upsert(
  creds: DnsProviderCredentials,
  record: DnsRecord,
  action: 'UPSERT' | 'DELETE',
): Promise<void> {
  const zoneId = creds.zoneId;
  if (!zoneId) throw new Error('Route53 requiere zoneId (HostedZoneId)');

  const body = `<?xml version="1.0" encoding="UTF-8"?>
<ChangeResourceRecordSetsRequest xmlns="https://route53.amazonaws.com/doc/2013-04-01/">
  <ChangeBatch>
    <Changes>
      <Change>
        <Action>${action}</Action>
        <ResourceRecordSet>
          <Name>${record.name}</Name>
          <Type>${record.type}</Type>
          <TTL>${record.ttl ?? 3600}</TTL>
          <ResourceRecords>
            <ResourceRecord>
              <Value>${record.value}</Value>
            </ResourceRecord>
          </ResourceRecords>
        </ResourceRecordSet>
      </Change>
    </Changes>
  </ChangeBatch>
</ChangeResourceRecordSetsRequest>`;

  const url = `https://route53.amazonaws.com/2013-04-01/hostedzone/${zoneId}/rrset`;
  const headers = await route53SignedHeaders(creds, 'POST', url, body);

  const res = await fetch(url, {
    method: 'POST',
    headers,
    body,
    signal: AbortSignal.timeout(15_000),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '(sin cuerpo)');
    throw new Error(`Route53 HTTP ${res.status}: ${text}`);
  }
}

export const Route53Adapter: DnsProviderAdapter = {
  async createRecord(creds, record) {
    await route53Upsert(creds, record, 'UPSERT');
  },

  async deleteRecord(creds, record) {
    await route53Upsert(creds, record, 'DELETE');
  },

  async listRecords(creds, name, type) {
    const zoneId = creds.zoneId;
    if (!zoneId) throw new Error('Route53 requiere zoneId (HostedZoneId)');

    const url = `https://route53.amazonaws.com/2013-04-01/hostedzone/${zoneId}/rrset?name=${encodeURIComponent(name)}&type=${type}&maxitems=10`;
    const headers = await route53SignedHeaders(creds, 'GET', url, '');

    const res = await fetch(url, { method: 'GET', headers, signal: AbortSignal.timeout(15_000) });
    if (!res.ok) {
      const text = await res.text().catch(() => '(sin cuerpo)');
      throw new Error(`Route53 HTTP ${res.status}: ${text}`);
    }

    const xml = await res.text();
    const valueMatches = [...xml.matchAll(/<Value>([^<]+)<\/Value>/g)];
    return valueMatches.map((m) => ({ type, name, value: m[1] }));
  },
};

// ---------------------------------------------------------------------------
// PowerDNS Authoritative Server API
// https://doc.powerdns.com/authoritative/http-api/zone.html
// apiKey = X-API-Key header, zoneId = zone name (e.g. "example.com.")
// ---------------------------------------------------------------------------
export const PowerDnsAdapter: DnsProviderAdapter = {
  async createRecord(creds, record) {
    const zone = creds.zoneId;
    if (!zone) throw new Error('PowerDNS requiere zoneId (nombre de zona con punto final)');

    // PowerDNS usa PATCH para añadir/reemplazar rrsets
    await httpJson<unknown>(
      `${creds.apiKey.startsWith('http') ? '' : 'http://localhost:8081'}/api/v1/servers/localhost/zones/${zone}`,
      'PATCH',
      { 'X-API-Key': creds.apiKey },
      {
        rrsets: [
          {
            name: record.name.endsWith('.') ? record.name : `${record.name}.`,
            type: record.type,
            ttl: record.ttl ?? 3600,
            changetype: 'REPLACE',
            records: [{ content: record.value, disabled: false }],
          },
        ],
      },
    );
  },

  async deleteRecord(creds, record) {
    const zone = creds.zoneId;
    if (!zone) throw new Error('PowerDNS requiere zoneId');

    await httpJson<unknown>(
      `http://localhost:8081/api/v1/servers/localhost/zones/${zone}`,
      'PATCH',
      { 'X-API-Key': creds.apiKey },
      {
        rrsets: [
          {
            name: record.name.endsWith('.') ? record.name : `${record.name}.`,
            type: record.type,
            changetype: 'DELETE',
          },
        ],
      },
    );
  },

  async listRecords(creds, name, type) {
    const zone = creds.zoneId;
    if (!zone) throw new Error('PowerDNS requiere zoneId');

    const res = await httpJson<{ rrsets: Array<{ name: string; type: string; records: Array<{ content: string }>; ttl: number }> }>(
      `http://localhost:8081/api/v1/servers/localhost/zones/${zone}`,
      'GET',
      { 'X-API-Key': creds.apiKey },
    );

    const normalizedName = name.endsWith('.') ? name : `${name}.`;
    return (res?.rrsets ?? [])
      .filter((r) => r.name === normalizedName && r.type === type)
      .flatMap((r) =>
        r.records.map((rec) => ({ type: r.type, name: r.name, value: rec.content, ttl: r.ttl })),
      );
  },
};

// ---------------------------------------------------------------------------
// MANUAL — No hace llamadas HTTP; solo registra el registro para gestión manual
// ---------------------------------------------------------------------------
export const ManualAdapter: DnsProviderAdapter = {
  async createRecord(_creds, _record) {
    // Gestión manual: el operador debe añadir el registro en su panel DNS.
    // El servicio solo registra la operación en logs (el llamador ya lo hace).
  },
  async deleteRecord(_creds, _record) {
    // Gestión manual: el operador debe eliminar el registro manualmente.
  },
  async listRecords(_creds, _name, _type): Promise<DnsRecord[]> {
    return [];
  },
};

// ---------------------------------------------------------------------------
// Registry de adaptadores
// ---------------------------------------------------------------------------
import { DnsProviderType } from '@prisma/client';

export const DNS_ADAPTERS: Record<DnsProviderType, DnsProviderAdapter> = {
  [DnsProviderType.CLOUDFLARE]: CloudflareAdapter,
  [DnsProviderType.HETZNER]: HetznerAdapter,
  [DnsProviderType.OVH]: OvhAdapter,
  [DnsProviderType.ROUTE53]: Route53Adapter,
  [DnsProviderType.POWERDNS]: PowerDnsAdapter,
  [DnsProviderType.MANUAL]: ManualAdapter,
};
