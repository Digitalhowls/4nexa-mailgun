import { Injectable } from '@nestjs/common';
import * as dns from 'dns/promises';
import { createLogger } from '@4nexa/logger';
import type { DnsCheckResult, DnsRecordCheckItem } from '@4nexa/types';
import { DnsRecordStatus } from '@4nexa/types';

const logger = createLogger({ service: 'dns-checker' });

@Injectable()
export class DnsCheckerService {
  async checkDomain(
    domainId: string,
    domain: string,
    dkimSelector: string,
    dkimPublicKey: string | null,
  ): Promise<DnsCheckResult> {
    const [mxResult, spfResult, dkimResult, dmarcResult, ptrResult] = await Promise.allSettled([
      this.checkMx(domain),
      this.checkSpf(domain),
      this.checkDkim(domain, dkimSelector, dkimPublicKey),
      this.checkDmarc(domain),
      this.checkPtr(domain),
    ]);

    const fallback = (type: string): DnsRecordCheckItem => ({
      type,
      status: DnsRecordStatus.INVALID,
      found: null,
      expected: type,
      message: null,
    });

    const mx = mxResult.status === 'fulfilled' ? mxResult.value : fallback('MX');
    const spf = spfResult.status === 'fulfilled' ? spfResult.value : fallback('SPF');
    const dkim = dkimResult.status === 'fulfilled' ? dkimResult.value : fallback('DKIM');
    const dmarc = dmarcResult.status === 'fulfilled' ? dmarcResult.value : fallback('DMARC');
    const ptr = ptrResult.status === 'fulfilled' ? ptrResult.value : fallback('PTR');

    const allPassed =
      mx.status === DnsRecordStatus.VALID &&
      spf.status === DnsRecordStatus.VALID &&
      dkim.status === DnsRecordStatus.VALID &&
      dmarc.status === DnsRecordStatus.VALID;

    return {
      domainId,
      domain,
      checkedAt: new Date(),
      mx,
      spf,
      dkim,
      dmarc,
      ptr,
      allPassed,
    };
  }

  private async checkMx(domain: string): Promise<DnsRecordCheckItem> {
    try {
      const records = await dns.resolveMx(domain);
      const hasMx = records.length > 0;
      return {
        type: 'MX',
        status: hasMx ? DnsRecordStatus.VALID : DnsRecordStatus.MISSING,
        found: records.map((r) => `${r.priority} ${r.exchange}`).join(', ') || null,
        expected: 'MX record apuntando al servidor de correo',
        message: null,
      };
    } catch (err) {
      logger.warn({ domain }, `Error al verificar MX: ${String(err)}`);
      return { type: 'MX', status: DnsRecordStatus.MISSING, found: null, expected: 'MX record', message: null };
    }
  }

  private async checkSpf(domain: string): Promise<DnsRecordCheckItem> {
    try {
      const records = await dns.resolveTxt(domain);
      const spfRecord = records.find((r) => r.join('').startsWith('v=spf1'));
      return {
        type: 'SPF',
        status: spfRecord ? DnsRecordStatus.VALID : DnsRecordStatus.MISSING,
        found: spfRecord?.join('') ?? null,
        expected: 'v=spf1 ... -all',
        message: null,
      };
    } catch {
      return { type: 'SPF', status: DnsRecordStatus.MISSING, found: null, expected: 'v=spf1 ... -all', message: null };
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
        return { type: 'DKIM', status: DnsRecordStatus.MISSING, found: null, expected: `v=DKIM1; k=rsa; p=<publicKey>`, message: null };
      }

      if (publicKey) {
        const cleanKey = publicKey.replace(/\s+/g, '');
        const valid = dkimRecord.includes(cleanKey);
        return {
          type: 'DKIM',
          status: valid ? DnsRecordStatus.VALID : DnsRecordStatus.INVALID,
          found: dkimRecord,
          expected: `v=DKIM1; k=rsa; p=${publicKey}`,
          message: null,
        };
      }

      return { type: 'DKIM', status: DnsRecordStatus.VALID, found: dkimRecord, expected: `v=DKIM1; k=rsa; p=<publicKey>`, message: null };
    } catch {
      return {
        type: 'DKIM',
        status: DnsRecordStatus.MISSING,
        found: null,
        expected: `TXT ${dkimDomain} → v=DKIM1; k=rsa; p=<publicKey>`,
        message: null,
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
        type: 'DMARC',
        status: dmarcRecord ? DnsRecordStatus.VALID : DnsRecordStatus.MISSING,
        found: dmarcRecord ?? null,
        expected: 'v=DMARC1; p=quarantine; rua=mailto:...',
        message: null,
      };
    } catch {
      return {
        type: 'DMARC',
        status: DnsRecordStatus.MISSING,
        found: null,
        expected: `TXT ${dmarcDomain} → v=DMARC1; p=quarantine`,
        message: null,
      };
    }
  }

  private async checkPtr(domain: string): Promise<DnsRecordCheckItem> {
    // PTR check: intentar resolver la IP del MX y verificar que apunta al dominio
    try {
      const mxRecords = await dns.resolveMx(domain);
      if (!mxRecords.length) {
        return { type: 'PTR', status: DnsRecordStatus.MISSING, found: null, expected: `PTR apuntando a ${domain}`, message: null };
      }
      const mxHost = mxRecords[0]!.exchange;
      const addresses = await dns.resolve4(mxHost);
      if (!addresses.length) {
        return { type: 'PTR', status: DnsRecordStatus.MISSING, found: null, expected: `PTR apuntando a ${domain}`, message: null };
      }
      const ptrRecords = await dns.reverse(addresses[0]!);
      const valid = ptrRecords.some((r) => r.includes(domain) || r.includes(mxHost));
      return {
        type: 'PTR',
        status: valid ? DnsRecordStatus.VALID : DnsRecordStatus.INVALID,
        found: ptrRecords.join(', '),
        expected: `PTR apuntando a ${mxHost}`,
        message: null,
      };
    } catch {
      return { type: 'PTR', status: DnsRecordStatus.MISSING, found: null, expected: `PTR del servidor MX`, message: null };
    }
  }
}
