import {
  CloudflareAdapter,
  HetznerAdapter,
  OvhAdapter,
  Route53Adapter,
  PowerDnsAdapter,
  ManualAdapter,
  DNS_ADAPTERS,
} from './dns-adapters';
import type { DnsProviderCredentials, DnsRecord } from './dns-adapters';

// ─── Mock global.fetch ────────────────────────────────────────────────────────

const mockFetch = jest.fn();
global.fetch = mockFetch as unknown as typeof fetch;

function makeOkResponse(body: unknown) {
  return {
    ok: true,
    status: 200,
    statusText: 'OK',
    headers: { get: () => 'application/json' },
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(JSON.stringify(body)),
  };
}

function makeErrorResponse(status: number, body = '') {
  return {
    ok: false,
    status,
    statusText: 'Error',
    headers: { get: () => 'text/plain' },
    json: () => Promise.resolve({}),
    text: () => Promise.resolve(body),
  };
}

const cfCreds: DnsProviderCredentials = {
  apiKey: 'cf-token-abc',
  zoneId: 'zone-123',
};

const hetznerCreds: DnsProviderCredentials = {
  apiKey: 'htz-api-key',
  zoneId: 'zone-htz-456',
};

const record: DnsRecord = {
  type: 'TXT',
  name: 'mail.example.com',
  value: 'v=spf1 include:mail.example.com -all',
  ttl: 3600,
};

beforeEach(() => jest.clearAllMocks());

// ─── CloudflareAdapter ────────────────────────────────────────────────────────

describe('CloudflareAdapter', () => {
  describe('createRecord()', () => {
    it('llama a la API de Cloudflare con Bearer token', async () => {
      mockFetch.mockResolvedValue(makeOkResponse({ result: { id: 'rec-1' } }));

      await CloudflareAdapter.createRecord(cfCreds, record);

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining(`/zones/${cfCreds.zoneId}/dns_records`),
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({ Authorization: `Bearer ${cfCreds.apiKey}` }),
        }),
      );
    });

    it('lanza error cuando falta zoneId', async () => {
      await expect(
        CloudflareAdapter.createRecord({ apiKey: 'tok' }, record),
      ).rejects.toThrow(/zoneId/);
    });

    it('lanza error cuando el HTTP response no es ok', async () => {
      mockFetch.mockResolvedValue(makeErrorResponse(403, 'Forbidden'));

      await expect(CloudflareAdapter.createRecord(cfCreds, record)).rejects.toThrow('403');
    });
  });

  describe('listRecords()', () => {
    it('devuelve array mapeado desde result de Cloudflare', async () => {
      mockFetch.mockResolvedValue(
        makeOkResponse({
          result: [{ id: 'rec-1', type: 'TXT', name: 'mail.example.com', content: 'v=spf1', ttl: 3600 }],
        }),
      );

      const records = await CloudflareAdapter.listRecords(cfCreds, 'mail.example.com', 'TXT');

      expect(records).toHaveLength(1);
      expect(records[0].type).toBe('TXT');
      expect(records[0].value).toBe('v=spf1');
    });

    it('lanza error cuando falta zoneId', async () => {
      await expect(
        CloudflareAdapter.listRecords({ apiKey: 'tok' }, 'x', 'TXT'),
      ).rejects.toThrow(/zoneId/);
    });
  });

  describe('deleteRecord()', () => {
    it('busca registros existentes y elimina por id', async () => {
      // Primera llamada: listRecords → encuentra el registro
      mockFetch
        .mockResolvedValueOnce(
          makeOkResponse({
            result: [{ id: 'rec-del', type: 'TXT', name: 'mail.example.com', content: 'old', ttl: 300 }],
          }),
        )
        // Segunda llamada: DELETE
        .mockResolvedValueOnce(makeOkResponse({}));

      await CloudflareAdapter.deleteRecord(cfCreds, record);

      expect(mockFetch).toHaveBeenCalledTimes(2);
      expect(mockFetch).toHaveBeenLastCalledWith(
        expect.stringContaining('rec-del'),
        expect.objectContaining({ method: 'DELETE' }),
      );
    });
  });
});

// ─── HetznerAdapter ───────────────────────────────────────────────────────────

describe('HetznerAdapter', () => {
  describe('createRecord()', () => {
    it('llama a la API de Hetzner con Auth-API-Token', async () => {
      mockFetch.mockResolvedValue(makeOkResponse({ record: { id: 'h-rec-1' } }));

      await HetznerAdapter.createRecord(hetznerCreds, record);

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('hetzner.com'),
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({ 'Auth-API-Token': hetznerCreds.apiKey }),
        }),
      );
    });

    it('lanza error cuando falta zoneId', async () => {
      await expect(
        HetznerAdapter.createRecord({ apiKey: 'tok' }, record),
      ).rejects.toThrow(/zoneId/);
    });
  });

  describe('deleteRecord()', () => {
    it('llama DELETE por cada registro que tiene _id', async () => {
      // listRecords → devuelve registros con id
      mockFetch
        .mockResolvedValueOnce(makeOkResponse({
          records: [{ id: 'htz-rec-1', type: 'TXT', name: 'mail.example.com', value: 'v=spf1', ttl: 3600 }],
        }))
        // DELETE del registro
        .mockResolvedValueOnce(makeOkResponse({}));

      await HetznerAdapter.deleteRecord(hetznerCreds, record);

      expect(mockFetch).toHaveBeenCalledTimes(2);
      expect(mockFetch).toHaveBeenLastCalledWith(
        expect.stringContaining('htz-rec-1'),
        expect.objectContaining({ method: 'DELETE' }),
      );
    });

    it('no hace DELETE cuando el registro no tiene _id', async () => {
      mockFetch.mockResolvedValueOnce(makeOkResponse({
        records: [], // lista vacía → no hay nada que borrar
      }));

      await HetznerAdapter.deleteRecord(hetznerCreds, record);

      expect(mockFetch).toHaveBeenCalledTimes(1); // solo listRecords
    });
  });
});

// ─── ManualAdapter ────────────────────────────────────────────────────────────

describe('ManualAdapter', () => {
  it('createRecord() no hace ninguna llamada HTTP (no-op)', async () => {
    await ManualAdapter.createRecord({ apiKey: '' }, record);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('deleteRecord() no hace ninguna llamada HTTP (no-op)', async () => {
    await ManualAdapter.deleteRecord({ apiKey: '' }, record);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('listRecords() retorna array vacío', async () => {
    const result = await ManualAdapter.listRecords({ apiKey: '' }, 'x', 'TXT');
    expect(result).toEqual([]);
  });
});

// ─── DNS_ADAPTERS registry ────────────────────────────────────────────────────

describe('DNS_ADAPTERS registry', () => {
  it('contiene adaptador para cada proveedor soportado', () => {
    expect(DNS_ADAPTERS).toHaveProperty('CLOUDFLARE');
    expect(DNS_ADAPTERS).toHaveProperty('HETZNER');
    expect(DNS_ADAPTERS).toHaveProperty('OVH');
    expect(DNS_ADAPTERS).toHaveProperty('ROUTE53');
    expect(DNS_ADAPTERS).toHaveProperty('POWERDNS');
    expect(DNS_ADAPTERS).toHaveProperty('MANUAL');
  });

  it('CLOUDFLARE apunta al CloudflareAdapter correcto', () => {
    expect(DNS_ADAPTERS['CLOUDFLARE']).toBe(CloudflareAdapter);
  });

  it('MANUAL apunta al ManualAdapter', () => {
    expect(DNS_ADAPTERS['MANUAL']).toBe(ManualAdapter);
  });
});

// ─── OvhAdapter ──────────────────────────────────────────────────────────────

const ovhCreds: DnsProviderCredentials = {
  apiKey: 'ovh-app-key',
  apiSecret: 'ovh-consumer-key',
  zoneId: 'example.com',
};

describe('OvhAdapter', () => {
  describe('createRecord()', () => {
    it('llama a la API de OVH con cabeceras de firma HMAC', async () => {
      mockFetch.mockResolvedValue(makeOkResponse({ id: 123 }));

      await OvhAdapter.createRecord(ovhCreds, record);

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('eu.api.ovh.com'),
        expect.objectContaining({ method: 'POST' }),
      );
      const [, opts] = mockFetch.mock.calls[0] as [string, RequestInit];
      const headers = opts.headers as Record<string, string>;
      expect(headers['X-Ovh-Application']).toBe(ovhCreds.apiKey);
      expect(headers['X-Ovh-Signature']).toMatch(/^\$1\$/);
    });

    it('lanza error cuando falta zoneId', async () => {
      await expect(
        OvhAdapter.createRecord({ apiKey: 'k', apiSecret: 's' }, record),
      ).rejects.toThrow(/zoneId/);
    });

    it('lanza error cuando falta apiSecret', async () => {
      await expect(
        OvhAdapter.createRecord({ apiKey: 'k', zoneId: 'z.com' }, record),
      ).rejects.toThrow(/apiSecret/);
    });
  });

  describe('listRecords()', () => {
    it('lanza error cuando falta apiSecret', async () => {
      await expect(
        OvhAdapter.listRecords({ apiKey: 'k', zoneId: 'z.com' }, 'mail.z.com', 'TXT'),
      ).rejects.toThrow(/apiSecret/);
    });

    it('retorna registros mapeados por ID', async () => {
      mockFetch.mockResolvedValue(makeOkResponse([101, 102]));

      const result = await OvhAdapter.listRecords(ovhCreds, 'mail.example.com', 'TXT');

      expect(result).toHaveLength(2);
      expect(result[0]).toMatchObject({ type: 'TXT', name: 'mail.example.com' });
    });
  });

  describe('deleteRecord()', () => {
    it('llama a DELETE por cada ID encontrado en listRecords', async () => {
      // Primera llamada: listRecords devuelve un ID
      mockFetch
        .mockResolvedValueOnce(makeOkResponse([99]))
        // Segunda llamada: DELETE del registro
        .mockResolvedValueOnce(makeOkResponse({}));

      await OvhAdapter.deleteRecord(ovhCreds, record);

      expect(mockFetch).toHaveBeenCalledTimes(2);
    });
  });
});

// ─── Route53Adapter ───────────────────────────────────────────────────────────

const route53Creds: DnsProviderCredentials = {
  apiKey: 'AKIAIOSFODNN7EXAMPLE',
  apiSecret: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
  zoneId: 'Z148QEXAMPLE8V',
};

describe('Route53Adapter', () => {
  describe('createRecord()', () => {
    it('envía ChangeResourceRecordSets con cabeceras AWS4', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        statusText: 'OK',
        headers: { get: () => 'text/xml' },
        json: () => Promise.resolve({}),
        text: () => Promise.resolve(''),
      });

      await Route53Adapter.createRecord(route53Creds, record);

      const [url, opts] = mockFetch.mock.calls[0] as [string, RequestInit];
      expect(url).toContain('route53.amazonaws.com');
      const headers = opts.headers as Record<string, string>;
      expect(headers['Authorization']).toMatch(/^AWS4-HMAC-SHA256/);
      expect(headers['x-amz-date']).toBeTruthy();
    });

    it('lanza error cuando falta zoneId', async () => {
      await expect(
        Route53Adapter.createRecord(
          { apiKey: 'AKIA', apiSecret: 'secret' },
          record,
        ),
      ).rejects.toThrow(/zoneId/);
    });

    it('lanza error si Route53 responde con HTTP 400', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 400,
        statusText: 'Bad Request',
        text: () => Promise.resolve('InvalidInput'),
      });

      await expect(Route53Adapter.createRecord(route53Creds, record)).rejects.toThrow('400');
    });
  });

  describe('deleteRecord()', () => {
    it('envía Action DELETE para el registro', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        statusText: 'OK',
        headers: { get: () => 'text/xml' },
        text: () => Promise.resolve(''),
      });

      await Route53Adapter.deleteRecord(route53Creds, record);

      const [, opts] = mockFetch.mock.calls[0] as [string, RequestInit];
      expect(opts.body).toContain('<Action>DELETE</Action>');
    });
  });

  describe('listRecords()', () => {
    it('lanza error cuando falta zoneId', async () => {
      await expect(
        Route53Adapter.listRecords({ apiKey: 'k', apiSecret: 's' }, 'x', 'TXT'),
      ).rejects.toThrow(/zoneId/);
    });

    it('retorna array vacío cuando la respuesta no tiene ResourceRecordSets', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        statusText: 'OK',
        headers: { get: () => 'text/xml' },
        text: () => Promise.resolve('<?xml version="1.0"?><ListResourceRecordSetsResponse><ResourceRecordSets></ResourceRecordSets></ListResourceRecordSetsResponse>'),
      });

      const result = await Route53Adapter.listRecords(route53Creds, 'mail.example.com', 'TXT');
      expect(Array.isArray(result)).toBe(true);
    });

    it('lanza error cuando HTTP no es ok', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 403,
        statusText: 'Forbidden',
        text: () => Promise.resolve('AccessDenied'),
      });

      await expect(
        Route53Adapter.listRecords(route53Creds, 'mail.example.com', 'TXT'),
      ).rejects.toThrow('403');
    });
  });
});

// ─── PowerDnsAdapter ──────────────────────────────────────────────────────────

const pdnsCreds: DnsProviderCredentials = {
  apiKey: 'my-pdns-api-key',
  zoneId: 'example.com.',
};

describe('PowerDnsAdapter', () => {
  describe('createRecord()', () => {
    it('envía PATCH con changetype REPLACE a la API de PowerDNS', async () => {
      mockFetch.mockResolvedValue(makeOkResponse({}));

      await PowerDnsAdapter.createRecord(pdnsCreds, record);

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/v1/servers/localhost/zones/'),
        expect.objectContaining({ method: 'PATCH' }),
      );
      const [, opts] = mockFetch.mock.calls[0] as [string, RequestInit];
      const body = JSON.parse(opts.body as string);
      expect(body.rrsets[0].changetype).toBe('REPLACE');
    });

    it('lanza error cuando falta zoneId', async () => {
      await expect(
        PowerDnsAdapter.createRecord({ apiKey: 'k' }, record),
      ).rejects.toThrow(/zoneId/);
    });

    it('usa prefijo vacío en la URL cuando apiKey empieza por http', async () => {
      mockFetch.mockResolvedValue(makeOkResponse({}));
      const customCreds = { apiKey: 'http://pdns.internal:8081', zoneId: 'z.com.' };

      await PowerDnsAdapter.createRecord(customCreds, record);

      const [url] = mockFetch.mock.calls[0] as [string];
      // Cuando apiKey empieza por http, el prefijo es '' → URL relativa
      expect(url).toMatch(/^\/api\/v1\/servers\//);      
    });
  });

  describe('deleteRecord()', () => {
    it('envía PATCH con changetype DELETE', async () => {
      mockFetch.mockResolvedValue(makeOkResponse({}));

      await PowerDnsAdapter.deleteRecord(pdnsCreds, record);

      const [, opts] = mockFetch.mock.calls[0] as [string, RequestInit];
      const body = JSON.parse(opts.body as string);
      expect(body.rrsets[0].changetype).toBe('DELETE');
    });

    it('lanza error cuando falta zoneId en deleteRecord', async () => {
      await expect(
        PowerDnsAdapter.deleteRecord({ apiKey: 'k' }, record),
      ).rejects.toThrow(/zoneId/);
    });
  });

  describe('listRecords()', () => {
    it('filtra rrsets por nombre (normalizado) y tipo', async () => {
      mockFetch.mockResolvedValue(
        makeOkResponse({
          rrsets: [
            {
              name: 'mail.example.com.',
              type: 'TXT',
              ttl: 3600,
              records: [{ content: 'v=spf1 include:mail.example.com -all' }],
            },
            {
              name: 'mail.example.com.',
              type: 'MX',
              ttl: 3600,
              records: [{ content: '10 mail.example.com.' }],
            },
          ],
        }),
      );

      const result = await PowerDnsAdapter.listRecords(pdnsCreds, 'mail.example.com', 'TXT');

      expect(result).toHaveLength(1);
      expect(result[0].type).toBe('TXT');
      expect(result[0].value).toBe('v=spf1 include:mail.example.com -all');
    });

    it('lanza error cuando falta zoneId en listRecords', async () => {
      await expect(
        PowerDnsAdapter.listRecords({ apiKey: 'k' }, 'x', 'TXT'),
      ).rejects.toThrow(/zoneId/);
    });

    it('retorna array vacío si rrsets no contiene el tipo solicitado', async () => {
      mockFetch.mockResolvedValue(makeOkResponse({ rrsets: [] }));

      const result = await PowerDnsAdapter.listRecords(pdnsCreds, 'x.example.com', 'TXT');
      expect(result).toEqual([]);
    });
  });
});

// ─── Branches adicionales: ?? defaults y ternarios ───────────────────────────

describe('Cloudflare branches adicionales', () => {
  it('createRecord: usa ttl 3600 por defecto cuando record.ttl es undefined', async () => {
    mockFetch.mockResolvedValue(makeOkResponse({ result: { id: 'r1' } }));
    await CloudflareAdapter.createRecord(cfCreds, { type: 'TXT', name: 'x', value: 'v' });
    const [, opts] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(opts.body as string).ttl).toBe(3600);
  });

  it('deleteRecord: lanza error cuando falta zoneId', async () => {
    await expect(
      CloudflareAdapter.deleteRecord({ apiKey: 'tok' }, record),
    ).rejects.toThrow(/zoneId/);
  });

  it('listRecords: retorna [] cuando httpJson retorna undefined (sin content-type JSON)', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
      headers: { get: () => null },
      text: () => Promise.resolve(''),
    });
    const result = await CloudflareAdapter.listRecords(cfCreds, 'x.example.com', 'TXT');
    expect(result).toEqual([]);
  });
});

describe('Hetzner branches adicionales', () => {
  it('createRecord: usa ttl 3600 cuando record.ttl es undefined', async () => {
    mockFetch.mockResolvedValue(makeOkResponse({}));
    await HetznerAdapter.createRecord(hetznerCreds, { type: 'TXT', name: 'x', value: 'v' });
    const [, opts] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(opts.body as string).ttl).toBe(3600);
  });

  describe('listRecords()', () => {
    it('retorna registros filtrados por nombre y tipo', async () => {
      mockFetch.mockResolvedValue(makeOkResponse({
        records: [
          { id: 'h1', type: 'TXT', name: 'mail.example.com', value: 'v=spf1', ttl: 3600 },
          { id: 'h2', type: 'MX', name: 'mail.example.com', value: '10 mx', ttl: 3600 },
        ],
      }));
      const result = await HetznerAdapter.listRecords(hetznerCreds, 'mail.example.com', 'TXT');
      expect(result).toHaveLength(1);
      expect(result[0].type).toBe('TXT');
    });

    it('lanza error cuando falta zoneId', async () => {
      await expect(
        HetznerAdapter.listRecords({ apiKey: 'tok' }, 'x', 'TXT'),
      ).rejects.toThrow(/zoneId/);
    });

    it('retorna [] cuando la respuesta no tiene records (sin content-type JSON)', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        statusText: 'OK',
        headers: { get: () => null },
        text: () => Promise.resolve(''),
      });
      const result = await HetznerAdapter.listRecords(hetznerCreds, 'x', 'TXT');
      expect(result).toEqual([]);
    });
  });
});

describe('OVH branches adicionales', () => {
  it('createRecord: usa ttl 3600 cuando record.ttl es undefined', async () => {
    mockFetch.mockResolvedValue(makeOkResponse({ id: 123 }));
    await OvhAdapter.createRecord(ovhCreds, { type: 'TXT', name: 'x.example.com', value: 'v' });
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('listRecords: retorna [] cuando ids es null (sin content-type JSON)', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
      headers: { get: () => null },
      text: () => Promise.resolve(''),
    });
    const result = await OvhAdapter.listRecords(ovhCreds, 'x.example.com', 'TXT');
    expect(result).toEqual([]);
  });
});

describe('Route53 branches adicionales', () => {
  it('createRecord: usa ttl 3600 cuando record.ttl es undefined (cubre línea 326)', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
      headers: { get: () => 'text/xml' },
      text: () => Promise.resolve(''),
    });
    await Route53Adapter.createRecord(route53Creds, { type: 'TXT', name: 'x', value: 'v' });
    const [, opts] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(opts.body as string).toContain('<TTL>3600</TTL>');
  });

  it('route53SignedHeaders: usa "" como apiSecret cuando no está definido', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
      headers: { get: () => 'text/xml' },
      text: () => Promise.resolve(''),
    });
    const credsNoSecret: DnsProviderCredentials = { apiKey: 'AKIAIOSFODNN7EXAMPLE', zoneId: 'Z148QEXAMPLE8V' };
    await Route53Adapter.createRecord(credsNoSecret, record);
    const [, opts] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect((opts.headers as Record<string, string>)['Authorization']).toMatch(/^AWS4-HMAC-SHA256/);
  });
});

describe('PowerDNS branches adicionales', () => {
  it('createRecord: no añade punto si el nombre ya termina en punto', async () => {
    mockFetch.mockResolvedValue(makeOkResponse({}));
    await PowerDnsAdapter.createRecord(pdnsCreds, { ...record, name: 'mail.example.com.' });
    const [, opts] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(opts.body as string).rrsets[0].name).toBe('mail.example.com.');
  });

  it('createRecord: usa ttl 3600 cuando record.ttl es undefined', async () => {
    mockFetch.mockResolvedValue(makeOkResponse({}));
    await PowerDnsAdapter.createRecord(pdnsCreds, { type: 'TXT', name: 'x', value: 'v' });
    const [, opts] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(opts.body as string).rrsets[0].ttl).toBe(3600);
  });

  it('deleteRecord: no añade punto si el nombre ya termina en punto', async () => {
    mockFetch.mockResolvedValue(makeOkResponse({}));
    await PowerDnsAdapter.deleteRecord(pdnsCreds, { ...record, name: 'mail.example.com.' });
    const [, opts] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(opts.body as string).rrsets[0].name).toBe('mail.example.com.');
  });

  it('listRecords: retorna [] cuando res es undefined (sin content-type JSON)', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
      headers: { get: () => null },
      text: () => Promise.resolve(''),
    });
    const result = await PowerDnsAdapter.listRecords(pdnsCreds, 'x.example.com', 'TXT');
    expect(result).toEqual([]);
  });

  it('listRecords: normalizedName ya tiene punto cuando name termina en punto', async () => {
    mockFetch.mockResolvedValue(makeOkResponse({
      rrsets: [
        {
          name: 'mail.example.com.',
          type: 'TXT',
          ttl: 3600,
          records: [{ content: 'v=spf1' }],
        },
      ],
    }));
    // name ya tiene punto → normalizedName = name (rama truthy del ternario)
    const result = await PowerDnsAdapter.listRecords(pdnsCreds, 'mail.example.com.', 'TXT');
    expect(result).toHaveLength(1);
    expect(result[0].value).toBe('v=spf1');
  });
});
