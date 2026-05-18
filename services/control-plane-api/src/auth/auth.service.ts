import {
  Injectable,
  UnauthorizedException,
  ForbiddenException,
  ConflictException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as argon2 from 'argon2';
import * as crypto from 'crypto';
import * as OTPAuth from 'otpauth';
import { PrismaService } from '../prisma/prisma.service';
import type { AuthTokenPayload, AuthTokens } from '@4nexa/types';
import type { EnvConfig } from '../config/env.schema';
import type { LoginInput, RegisterUserInput } from '@4nexa/validators';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService<EnvConfig, true>,
  ) {}

  // ── Login ──────────────────────────────────────────────────────────────────

  async login(
    input: LoginInput,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<AuthTokens> {
    const user = await this.prisma.user.findUnique({
      where: { email: input.email },
    });

    if (!user) {
      throw new UnauthorizedException('Credenciales incorrectas');
    }

    if (user.status === 'SUSPENDED') {
      throw new ForbiddenException('Cuenta suspendida');
    }

    // Bloqueo temporal por intentos fallidos
    if (user.lockedUntil && user.lockedUntil > new Date()) {
      throw new UnauthorizedException('Cuenta bloqueada temporalmente');
    }

    const passwordValid = await argon2.verify(user.passwordHash, input.password);
    if (!passwordValid) {
      await this.prisma.user.update({
        where: { id: user.id },
        data: {
          failedLoginAttempts: { increment: 1 },
          // Bloquear 15 min tras 5 intentos fallidos
          lockedUntil:
            user.failedLoginAttempts + 1 >= 5
              ? new Date(Date.now() + 15 * 60 * 1000)
              : undefined,
        },
      });
      throw new UnauthorizedException('Credenciales incorrectas');
    }

    // TOTP
    if (user.totpEnabled) {
      if (!input.totpCode) {
        throw new UnauthorizedException('Se requiere código TOTP');
      }
      const valid = this.verifyTotp(user.totpSecret!, input.totpCode);
      if (!valid) {
        throw new UnauthorizedException('Código TOTP inválido');
      }
    }

    // Resetear intentos fallidos
    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        failedLoginAttempts: 0,
        lockedUntil: null,
        lastLoginAt: new Date(),
      },
    });

    return this.generateTokens(
      {
        sub: user.id,
        email: user.email,
        role: user.role as AuthTokenPayload['role'],
        tenantId: user.tenantId ?? undefined,
        jti: crypto.randomUUID(),
      },
      ipAddress,
      userAgent,
    );
  }

  // ── Registro ───────────────────────────────────────────────────────────────

  async register(input: RegisterUserInput): Promise<{ id: string; email: string }> {
    const existing = await this.prisma.user.findUnique({ where: { email: input.email } });
    if (existing) {
      throw new ConflictException('El email ya está registrado');
    }

    const passwordHash = await argon2.hash(input.password, {
      type: argon2.argon2id,
      memoryCost: 65536,
      timeCost: 3,
      parallelism: 4,
    });

    const user = await this.prisma.user.create({
      data: {
        email: input.email,
        passwordHash,
        role: input.role,
        tenantId: input.tenantId ?? null,
        status: 'PENDING_VERIFICATION',
      },
    });

    return { id: user.id, email: user.email };
  }

  // ── Refresh token ──────────────────────────────────────────────────────────

  async refreshTokens(
    refreshToken: string,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<AuthTokens> {
    let payload: AuthTokenPayload;
    try {
      payload = this.jwtService.verify<AuthTokenPayload>(refreshToken, {
        secret: this.config.get('JWT_REFRESH_SECRET'),
      });
    } catch {
      throw new UnauthorizedException('Refresh token inválido o expirado');
    }

    const stored = await this.prisma.refreshToken.findUnique({
      where: { jti: payload.jti },
      include: { user: true },
    });

    if (!stored || stored.revokedAt !== null) {
      throw new UnauthorizedException('Refresh token revocado');
    }

    if (stored.expiresAt < new Date()) {
      throw new UnauthorizedException('Refresh token expirado');
    }

    // Revocar el token actual (rotación)
    await this.prisma.refreshToken.update({
      where: { id: stored.id },
      data: { revokedAt: new Date() },
    });

    return this.generateTokens(
      {
        sub: stored.user.id,
        email: stored.user.email,
        role: stored.user.role as AuthTokenPayload['role'],
        tenantId: stored.user.tenantId ?? undefined,
        jti: crypto.randomUUID(),
      },
      ipAddress,
      userAgent,
    );
  }

  // ── Logout ─────────────────────────────────────────────────────────────────

  async logout(jti: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { jti, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  // ── TOTP ───────────────────────────────────────────────────────────────────

  generateTotpSecret(): { secret: string; uri: string } {
    const secret = new OTPAuth.Secret({ size: 20 });
    const totp = new OTPAuth.TOTP({
      issuer: '4nexa Mail',
      algorithm: 'SHA1',
      digits: 6,
      period: 30,
      secret,
    });
    return { secret: secret.base32, uri: totp.toString() };
  }

  verifyTotp(secretBase32: string, code: string): boolean {
    const totp = new OTPAuth.TOTP({
      algorithm: 'SHA1',
      digits: 6,
      period: 30,
      secret: OTPAuth.Secret.fromBase32(secretBase32),
    });
    const delta = totp.validate({ token: code, window: 1 });
    return delta !== null;
  }

  async enableTotp(userId: string, secret: string, code: string): Promise<void> {
    const valid = this.verifyTotp(secret, code);
    if (!valid) {
      throw new UnauthorizedException('Código TOTP inválido para activación');
    }
    await this.prisma.user.update({
      where: { id: userId },
      data: { totpSecret: secret, totpEnabled: true },
    });
  }

  async disableTotp(userId: string): Promise<void> {
    await this.prisma.user.update({
      where: { id: userId },
      data: { totpSecret: null, totpEnabled: false },
    });
  }

  // ── Helpers privados ───────────────────────────────────────────────────────

  private async generateTokens(
    payload: AuthTokenPayload,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<AuthTokens> {
    const accessToken = this.jwtService.sign(payload, {
      secret: this.config.get('JWT_ACCESS_SECRET'),
      expiresIn: this.config.get('JWT_ACCESS_EXPIRES_IN'),
    });

    // El refresh token reutiliza el mismo jti que el access token para que
    // logout(user.jti) pueda localizar y revocar el refresh token en la BD.
    const refreshExpiresIn = this.config.get('JWT_REFRESH_EXPIRES_IN');
    const refreshToken = this.jwtService.sign(payload, {
      secret: this.config.get('JWT_REFRESH_SECRET'),
      expiresIn: refreshExpiresIn,
    });

    // Calcular expiración del refresh token
    const expiresAt = new Date();
    const match = refreshExpiresIn.match(/^(\d+)([smhd])$/);
    if (match) {
      const amount = parseInt(match[1]!, 10);
      const unit = match[2];
      const ms: Record<string, number> = { s: 1000, m: 60000, h: 3600000, d: 86400000 };
      expiresAt.setTime(expiresAt.getTime() + amount * (ms[unit!] ?? 0));
    }

    await this.prisma.refreshToken.create({
      data: {
        userId: payload.sub,
        jti: payload.jti,
        expiresAt,
        ipAddress: ipAddress ?? null,
        userAgent: userAgent ?? null,
      },
    });

    return { accessToken, refreshToken };
  }
}
