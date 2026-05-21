import { ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RolesGuard } from './roles.guard';
import { ROLES_KEY } from '../../common/decorators/roles.decorator';
import { UserRole } from '@4nexa/types';
import type { ExecutionContext } from '@nestjs/common';

describe('RolesGuard', () => {
  let reflector: Reflector;
  let guard: RolesGuard;

  beforeEach(() => {
    reflector = { getAllAndOverride: jest.fn() } as unknown as Reflector;
    guard = new RolesGuard(reflector);
  });

  function makeCtx(role: string): ExecutionContext {
    return {
      getHandler: jest.fn(),
      getClass: jest.fn(),
      switchToHttp: () => ({
        getRequest: () => ({ user: { role } }),
      }),
    } as unknown as ExecutionContext;
  }

  it('permite el acceso cuando no hay roles requeridos (ruta pública)', () => {
    (reflector.getAllAndOverride as jest.Mock).mockReturnValue(undefined);
    expect(guard.canActivate(makeCtx('TENANT_ADMIN'))).toBe(true);
  });

  it('permite el acceso cuando la lista de roles requeridos está vacía', () => {
    (reflector.getAllAndOverride as jest.Mock).mockReturnValue([]);
    expect(guard.canActivate(makeCtx('TENANT_ADMIN'))).toBe(true);
  });

  it('permite el acceso cuando el usuario tiene el rol requerido', () => {
    (reflector.getAllAndOverride as jest.Mock).mockReturnValue([UserRole.SUPER_ADMIN]);
    expect(guard.canActivate(makeCtx(UserRole.SUPER_ADMIN))).toBe(true);
  });

  it('permite el acceso cuando el rol del usuario está en la lista de roles permitidos', () => {
    (reflector.getAllAndOverride as jest.Mock).mockReturnValue([
      UserRole.SUPER_ADMIN,
      UserRole.PLATFORM_ADMIN,
    ]);
    expect(guard.canActivate(makeCtx(UserRole.PLATFORM_ADMIN))).toBe(true);
  });

  it('lanza ForbiddenException cuando el usuario no tiene el rol requerido', () => {
    (reflector.getAllAndOverride as jest.Mock).mockReturnValue([UserRole.SUPER_ADMIN]);
    expect(() => guard.canActivate(makeCtx('TENANT_ADMIN'))).toThrow(ForbiddenException);
  });

  it('lanza ForbiddenException con mensaje descriptivo', () => {
    (reflector.getAllAndOverride as jest.Mock).mockReturnValue([UserRole.SUPER_ADMIN]);
    expect(() => guard.canActivate(makeCtx('TENANT_ADMIN'))).toThrow(
      'No tienes permisos para realizar esta acción',
    );
  });

  it('verifica usando ROLES_KEY en el reflector', () => {
    (reflector.getAllAndOverride as jest.Mock).mockReturnValue([UserRole.SUPER_ADMIN]);
    const ctx = makeCtx(UserRole.SUPER_ADMIN);
    guard.canActivate(ctx);
    expect(reflector.getAllAndOverride).toHaveBeenCalledWith(ROLES_KEY, expect.any(Array));
  });
});
