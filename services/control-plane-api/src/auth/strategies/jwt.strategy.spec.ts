import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtStrategy } from './jwt.strategy';
import type { AuthTokenPayload } from '@4nexa/types';

const mockPayload: AuthTokenPayload = {
  sub: 'user-uuid-1',
  email: 'admin@example.com',
  role: 'TENANT_ADMIN',
  tenantId: 'tenant-uuid-1',
  jti: 'jti-uuid-1',
};

describe('JwtStrategy', () => {
  let strategy: JwtStrategy;
  let prismaFindUnique: jest.Mock;

  beforeEach(() => {
    prismaFindUnique = jest.fn();

    const config = {
      get: jest.fn().mockReturnValue('test-secret'),
    } as unknown as ConfigService<any, true>;

    const prisma = {
      user: { findUnique: prismaFindUnique },
    } as any;

    strategy = new JwtStrategy(config, prisma);
  });

  it('devuelve el payload cuando el usuario existe y está ACTIVE', async () => {
    prismaFindUnique.mockResolvedValueOnce({ id: mockPayload.sub, status: 'ACTIVE' });

    const result = await strategy.validate(mockPayload);

    expect(result).toEqual(mockPayload);
    expect(prismaFindUnique).toHaveBeenCalledWith({
      where: { id: mockPayload.sub },
      select: { id: true, status: true },
    });
  });

  it('lanza UnauthorizedException cuando el usuario no existe', async () => {
    prismaFindUnique.mockResolvedValueOnce(null);

    await expect(strategy.validate(mockPayload)).rejects.toThrow(UnauthorizedException);
  });

  it('lanza UnauthorizedException cuando el usuario está INACTIVE', async () => {
    prismaFindUnique.mockResolvedValueOnce({ id: mockPayload.sub, status: 'INACTIVE' });

    await expect(strategy.validate(mockPayload)).rejects.toThrow(UnauthorizedException);
  });

  it('lanza UnauthorizedException cuando el usuario está SUSPENDED', async () => {
    prismaFindUnique.mockResolvedValueOnce({ id: mockPayload.sub, status: 'SUSPENDED' });

    await expect(strategy.validate(mockPayload)).rejects.toThrow(UnauthorizedException);
  });

  it('lanza la excepción cuando la consulta a Prisma falla', async () => {
    prismaFindUnique.mockRejectedValueOnce(new Error('DB error'));

    await expect(strategy.validate(mockPayload)).rejects.toThrow(Error);
  });
});
