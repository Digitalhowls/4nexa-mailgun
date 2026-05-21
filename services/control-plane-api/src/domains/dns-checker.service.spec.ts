import { Test } from '@nestjs/testing';
import { DnsCheckerService } from './dns-checker.service';
import { DnsRecordStatus } from '@4nexa/types';

// ─── Mock de dns/promises ────────────────────────────────────────────────────

const mockResolveMx = jest.fn();
const mockResolveTxt = jest.fn();
const mockResolve4 = jest.fn();
const mockReverse = jest.fn();

jest.mock('dns/promises', () => ({
  resolveMx: (...args: unknown[]) => mockResolveMx(...args),
  resolveTxt: (...args: unknown[]) => mockResolveTxt(...args),
  resolve4: (...args: unknown[]) => mockResolve4(...args),
  reverse: (...args: unknown[]) => mockReverse(...args),
}));

// ─── Suite ───────────────────────────────────────────────────────────────────

describe('DnsCheckerService', () => {
  let service: DnsCheckerService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module = await Test.createTestingModule({
      providers: [DnsCheckerService],
    }).compile();
    service = module.get(DnsCheckerService);
  });

  // ─── checkDomain() ────────────────────────────────────────────────────────

  describe('checkDomain() — todos los registros válidos', () => {
    it('retorna allPassed=true cuando MX, SPF, DKIM y DMARC están presentes', async () => {
      mockResolveMx.mockResolvedValue([{ priority: 10, exchange: 'mail.example.com' }]);
      mockResolveTxt
        .mockResolvedValueOnce([['v=spf1 include:example.com -all']]) // SPF en example.com
        .mockResolvedValueOnce([['v=DKIM1; k=rsa; p=MIGfMA0']]) // DKIM en selector._domainkey.example.com
        .mockResolvedValueOnce([['v=DMARC1; p=quarantine; rua=mailto:dmarc@example.com']]) // DMARC en _dmarc.example.com
        .mockRejectedValue(new Error('no PTR')); // PTR falla

      const result = await service.checkDomain('dom-1', 'example.com', 'selector', 'MIGfMA0');

      expect(result.allPassed).toBe(true);
      expect(result.mx.status).toBe(DnsRecordStatus.VALID);
      expect(result.spf.status).toBe(DnsRecordStatus.VALID);
      expect(result.dkim.status).toBe(DnsRecordStatus.VALID);
      expect(result.dmarc.status).toBe(DnsRecordStatus.VALID);
      expect(result.domainId).toBe('dom-1');
      expect(result.domain).toBe('example.com');
    });
  });

  describe('checkDomain() — MX faltante', () => {
    it('retorna allPassed=false cuando resolveMx lanza error', async () => {
      mockResolveMx.mockRejectedValue(new Error('ENOTFOUND'));
      mockResolveTxt.mockRejectedValue(new Error('ENOTFOUND'));
      mockReverse.mockRejectedValue(new Error('ENOTFOUND'));

      const result = await service.checkDomain('dom-2', 'nodns.invalid', 'sel', null);

      expect(result.allPassed).toBe(false);
      expect(result.mx.status).toBe(DnsRecordStatus.MISSING);
    });

    it('retorna MX MISSING cuando el array de registros está vacío', async () => {
      mockResolveMx.mockResolvedValue([]);
      mockResolveTxt.mockRejectedValue(new Error('ENOTFOUND'));
      mockReverse.mockRejectedValue(new Error('ENOTFOUND'));

      const result = await service.checkDomain('dom-3', 'example.com', 'sel', null);

      expect(result.mx.status).toBe(DnsRecordStatus.MISSING);
    });
  });

  describe('checkDomain() — SPF', () => {
    it('retorna SPF VALID cuando existe registro v=spf1', async () => {
      mockResolveMx.mockResolvedValue([{ priority: 10, exchange: 'mail.example.com' }]);
      mockResolveTxt
        .mockResolvedValueOnce([['v=spf1 include:example.com -all']])
        .mockResolvedValueOnce([['v=DKIM1; k=rsa; p=KEY']])
        .mockResolvedValueOnce([['v=DMARC1; p=none']]);
      mockReverse.mockRejectedValue(new Error('no PTR'));

      const result = await service.checkDomain('dom-4', 'example.com', 'sel', 'KEY');

      expect(result.spf.status).toBe(DnsRecordStatus.VALID);
      expect(result.spf.found).toContain('v=spf1');
    });

    it('retorna SPF MISSING cuando no hay registro v=spf1', async () => {
      mockResolveMx.mockResolvedValue([{ priority: 10, exchange: 'mail.example.com' }]);
      mockResolveTxt
        .mockResolvedValueOnce([['some-other-txt']]) // sin SPF
        .mockRejectedValue(new Error('ENOTFOUND'));
      mockReverse.mockRejectedValue(new Error('no PTR'));

      const result = await service.checkDomain('dom-5', 'example.com', 'sel', null);

      expect(result.spf.status).toBe(DnsRecordStatus.MISSING);
    });
  });

  describe('checkDomain() — DKIM', () => {
    it('retorna DKIM INVALID cuando la clave pública no coincide', async () => {
      mockResolveMx.mockResolvedValue([{ priority: 10, exchange: 'mail.example.com' }]);
      mockResolveTxt
        .mockResolvedValueOnce([['v=spf1 include:example.com -all']])
        .mockResolvedValueOnce([['v=DKIM1; k=rsa; p=DIFFERENTKEY']])
        .mockResolvedValueOnce([['v=DMARC1; p=none']]);
      mockReverse.mockRejectedValue(new Error('no PTR'));

      const result = await service.checkDomain('dom-6', 'example.com', 'sel', 'EXPECTEDKEY');

      expect(result.dkim.status).toBe(DnsRecordStatus.INVALID);
    });

    it('retorna DKIM VALID cuando publicKey es null (solo verifica presencia)', async () => {
      mockResolveMx.mockResolvedValue([{ priority: 10, exchange: 'mail.example.com' }]);
      mockResolveTxt
        .mockResolvedValueOnce([['v=spf1 -all']])
        .mockResolvedValueOnce([['v=DKIM1; k=rsa; p=ANYKEY']])
        .mockResolvedValueOnce([['v=DMARC1; p=none']]);
      mockReverse.mockRejectedValue(new Error('no PTR'));

      const result = await service.checkDomain('dom-7', 'example.com', 'sel', null);

      expect(result.dkim.status).toBe(DnsRecordStatus.VALID);
    });

    it('retorna DKIM MISSING cuando no hay registro v=DKIM1', async () => {
      mockResolveMx.mockResolvedValue([{ priority: 10, exchange: 'mail.example.com' }]);
      mockResolveTxt
        .mockResolvedValueOnce([['v=spf1 -all']])
        .mockResolvedValueOnce([['some-other-txt']]) // sin DKIM1
        .mockResolvedValueOnce([['v=DMARC1; p=none']]);
      mockReverse.mockRejectedValue(new Error('no PTR'));

      const result = await service.checkDomain('dom-8', 'example.com', 'sel', null);

      expect(result.dkim.status).toBe(DnsRecordStatus.MISSING);
    });
  });

  describe('checkDomain() — DMARC', () => {
    it('retorna DMARC MISSING cuando falta el registro', async () => {
      mockResolveMx.mockResolvedValue([{ priority: 10, exchange: 'mail.example.com' }]);
      mockResolveTxt
        .mockResolvedValueOnce([['v=spf1 -all']])
        .mockResolvedValueOnce([['v=DKIM1; k=rsa; p=KEY']])
        .mockResolvedValueOnce([[]]); // sin DMARC
      mockReverse.mockRejectedValue(new Error('no PTR'));

      const result = await service.checkDomain('dom-9', 'example.com', 'sel', 'KEY');

      expect(result.dmarc.status).toBe(DnsRecordStatus.MISSING);
    });
  });

  describe('checkDomain() — fallback cuando resolveTxt lanza', () => {
    it('retorna status INVALID con fallback cuando SPF/DKIM/DMARC fallan', async () => {
      mockResolveMx.mockRejectedValue(new Error('SERVFAIL'));
      mockResolveTxt.mockRejectedValue(new Error('SERVFAIL'));
      mockReverse.mockRejectedValue(new Error('SERVFAIL'));

      const result = await service.checkDomain('dom-10', 'broken.invalid', 'sel', 'key');

      expect(result.allPassed).toBe(false);
      expect(result.checkedAt).toBeInstanceOf(Date);
    });
  });

  describe('checkDomain() — PTR válido e inválido', () => {
    it('retorna PTR MISSING cuando addresses está vacío (línea 165)', async () => {
      mockResolveMx.mockResolvedValue([{ priority: 10, exchange: 'mail.example.com' }]);
      mockResolveTxt
        .mockResolvedValueOnce([['v=spf1 -all']])
        .mockResolvedValueOnce([['v=DKIM1; k=rsa; p=K']])
        .mockResolvedValueOnce([['v=DMARC1; p=none']]);
      mockResolve4.mockResolvedValue([]); // sin addresses → MISSING
      mockReverse.mockResolvedValue([]);

      const result = await service.checkDomain('dom-11', 'example.com', 'sel', 'K');
      expect(result.ptr.status).toBe(DnsRecordStatus.MISSING);
    });

    it('retorna PTR VALID cuando reverse apunta al dominio', async () => {
      mockResolveMx.mockResolvedValue([{ priority: 10, exchange: 'mail.example.com' }]);
      mockResolveTxt
        .mockResolvedValueOnce([['v=spf1 -all']])
        .mockResolvedValueOnce([['v=DKIM1; k=rsa; p=K']])
        .mockResolvedValueOnce([['v=DMARC1; p=none']]);
      mockResolve4.mockResolvedValue(['1.2.3.4']);
      mockReverse.mockResolvedValue(['mail.example.com']); // incluye el dominio → VALID

      const result = await service.checkDomain('dom-12', 'example.com', 'sel', 'K');
      expect(result.ptr.status).toBe(DnsRecordStatus.VALID);
    });

    it('retorna PTR INVALID cuando reverse no apunta al dominio', async () => {
      mockResolveMx.mockResolvedValue([{ priority: 10, exchange: 'mail.example.com' }]);
      mockResolveTxt
        .mockResolvedValueOnce([['v=spf1 -all']])
        .mockResolvedValueOnce([['v=DKIM1; k=rsa; p=K']])
        .mockResolvedValueOnce([['v=DMARC1; p=none']]);
      mockResolve4.mockResolvedValue(['1.2.3.4']);
      mockReverse.mockResolvedValue(['unrelated.host.com']); // no coincide → INVALID

      const result = await service.checkDomain('dom-13', 'example.com', 'sel', 'K');
      expect(result.ptr.status).toBe(DnsRecordStatus.INVALID);
    });
  });

  describe('checkDomain() — ramas fallback líneas 33-37 (checks privados lanzan)', () => {
    it('usa fallback para todos los checks cuando los métodos privados lanzan', async () => {
      // Forzar que los 5 métodos privados lancen para que allSettled los marque 'rejected'
      jest.spyOn(service as any, 'checkMx').mockRejectedValue(new Error('mx forced'));
      jest.spyOn(service as any, 'checkSpf').mockRejectedValue(new Error('spf forced'));
      jest.spyOn(service as any, 'checkDkim').mockRejectedValue(new Error('dkim forced'));
      jest.spyOn(service as any, 'checkDmarc').mockRejectedValue(new Error('dmarc forced'));
      jest.spyOn(service as any, 'checkPtr').mockRejectedValue(new Error('ptr forced'));

      const result = await service.checkDomain('dom-ff', 'forced.invalid', 'sel', null);

      expect(result.mx.status).toBe(DnsRecordStatus.INVALID);
      expect(result.spf.status).toBe(DnsRecordStatus.INVALID);
      expect(result.dkim.status).toBe(DnsRecordStatus.INVALID);
      expect(result.dmarc.status).toBe(DnsRecordStatus.INVALID);
      expect(result.ptr.status).toBe(DnsRecordStatus.INVALID);
      expect(result.allPassed).toBe(false);
    });
  });
});
