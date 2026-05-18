import { Injectable } from '@nestjs/common';
import * as dns from 'dns/promises';
import { createLogger } from '@4nexa/logger';
import type { DnsCheckResult, DnsRecordCheckItem } from '@4nexa/types';

const logger = createLogger({ service: 'dns-checker' });

@Injectable()
export class DnsCheckerService {
  async checkDomain(
    domain: string,
    dkimSelector: string,
    dkimPublicKey: string | null,
  ): Promise<DnsCheckResult> {
    const [mxResult, spfResult, dkimResult, dmarcResult] = await Promise.allSettled([
      this.checkMx(domain),
      this.checkSpf(domain),
      this.checkDkim(domain, dkimSelector, dkimPublicKey),
      this.checkDmarc(domain),
    ]);

    const mx = mxResult.status === 'fulfilled' ? mxResult.value : { status: 'INVALID' as const, found: null, expected: null };
    const spf = spfResult.status === 'fulfilled' ? spfResult.value : { status: 'INVALID' as const, found: null, expected: null };
    const dkim = dkimResult.status === 'fulfilled' ? dkimResult.value : { status: 'INVALID' as const, found: null, expected: null };
    const dmarc = dmarcResult.status === 'fulfilled' ? dmarcResult.value : { status: 'INVALID' as const, found: null, expected: null };

    const allValid =
      mx.status === 'VALID' &&
      spf.status === 'VALID' &&
      dkim.status === 'VALID' &&
      dmarc.status === 'VALID';

    return {
      domain,
      allValid,
      checkedAt: new Date().toISOString(),
      records: { mx, spf, dkim, dmarc },
    };
  }

  private async checkMx(domain: string): Promise<DnsRecordCheckItem> {
    try {
      const records = await dns.resolveMx(domain);
      const hasMx = records.some((r) => r.exchange.includes('4nexa') || records.length > 0);

      return {
        status: hasMx ? 'VALID' : 'MISSING',
        found: records.map((r) => `${r.priority} ${r.exchange}`).join(', ') || null,
        expected: `MX record apuntando al servidor de correo`,
      };
    } catch (err) {
      logger.warn({ domain }, `Error al verificar MX: ${String(err)}`);
      return { status: 'MISSING', found: null, expected: 'MX record' };
    }
  }

  private async checkSpf(domain: string): Promise<DnsRecordCheckItem> {
    try {
      const records = await dns.resolveTxt(domain);
      const spfRecord = records.find((r) => r.join('').startsWith('v=spf1'));

      return {
        status: spfRecord ? 'VALID' : 'MISSING',
        found: spfRecord?.join('') ?? null,
        expected: 'v=spf1 ... -all',
      };
    } catch {
      return { status: 'MISSING', found: null, expected: 'v=spf1 ... -all' };
    }
  }

  private async checkDkim(
    domain: string,
    selector: string,
    publicKey: string | null,
  ): Promise<DnsRecordCheckItem> {
    const dkimDomain = `${selector}._domainkey.${domain}`;
    try {
      const records = await dns.resolveTxt(dkimDomain);
      const dkimRecord = records
        .map((r) => r.join(''))
        .find((r) => r.includes('v=DKIM1'));

      if (!dkimRecord) {
        return { status: 'MISSING', found: null, expected: `v=DKIM1; k=rsa; p=<publicKey>` };
      }

      // Si tenemos la clave pública, verificar que coincida
      if (publicKey) {
        const cleanKey = publicKey.replace(/\s+/g, '');
        const valid = dkimRecord.includes(cleanKey);
        return {
          status: valid ? 'VALID' : 'INVALID',
          found: dkimRecord,
          expected: `v=DKIM1; k=rsa; p=${publicKey}`,
        };
      }

      return { status: 'VALID', found: dkimRecord, expected: `v=DKIM1; k=rsa; p=<publicKey>` };
    } catch {
      return {
        status: 'MISSING',
        found: null,
        expected: `TXT ${dkimDomain} → v=DKIM1; k=rsa; p=<publicKey>`,
      };
    }
  }

  private async checkDmarc(domain: string): Promise<DnsRecordCheckItem> {
    const dmarcDomain = `_dmarc.${domain}`;
    try {
      const records = await dns.resolveTxt(dmarcDomain);
      const dmarcRecord = records
        .map((r) => r.join(''))
        .find((r) => r.startsWith('v=DMARC1'));

      return {
        status: dmarcRecord ? 'VALID' : 'MISSING',
        found: dmarcRecord ?? null,
        expected: 'v=DMARC1; p=quarantine; rua=mailto:...',
      };
    } catch {
      return {
        status: 'MISSING',
        found: null,
        expected: `TXT ${dmarcDomain} → v=DMARC1; p=quarantine`,
      };
    }
  }
}
