import {
  Controller,
  Post,
  Get,
  Body,
  HttpCode,
  HttpStatus,
  UseGuards,
  Req,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { FastifyRequest } from 'fastify';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import {
  LoginSchema,
  RegisterUserSchema,
  RefreshTokenSchema,
  EnableTotpSchema,
  ChangePasswordSchema,
  type LoginInput,
  type RegisterUserInput,
  type RefreshTokenInput,
  type EnableTotpInput,
  type ChangePasswordInput,
} from '@4nexa/validators';
import { UserRole, type AuthTokenPayload } from '@4nexa/types';
import { RolesGuard } from './guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { AuditService } from '../audit/audit.service';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly auditService: AuditService,
  ) {}

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Iniciar sesión' })
  async login(
    @Body(new ZodValidationPipe(LoginSchema)) body: LoginInput,
    @Req() req: FastifyRequest,
  ) {
    const tokens = await this.authService.login(
      body,
      req.ip,
      req.headers['user-agent'],
    );

    await this.auditService.log({
      action: 'auth.login',
      metadata: { email: body.email },
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });

    return { success: true, data: tokens };
  }

  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.SUPER_ADMIN, UserRole.PLATFORM_ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Registrar nuevo usuario (solo SUPER_ADMIN / PLATFORM_ADMIN)' })
  async register(
    @Body(new ZodValidationPipe(RegisterUserSchema)) body: RegisterUserInput,
    @CurrentUser() currentUser: AuthTokenPayload,
    @Req() req: FastifyRequest,
  ) {
    const user = await this.authService.register(body);

    await this.auditService.log({
      userId: currentUser.sub,
      tenantId: currentUser.tenantId ?? undefined,
      action: 'auth.register_user',
      entityType: 'user',
      entityId: user.id,
      metadata: { email: user.email, role: body.role },
      ipAddress: req.ip,
    });

    return { success: true, data: user };
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Renovar access token' })
  async refresh(
    @Body(new ZodValidationPipe(RefreshTokenSchema)) body: RefreshTokenInput,
    @Req() req: FastifyRequest,
  ) {
    const tokens = await this.authService.refreshTokens(
      body.refreshToken,
      req.ip,
      req.headers['user-agent'],
    );
    return { success: true, data: tokens };
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Obtener usuario autenticado' })
  async me(@CurrentUser() user: AuthTokenPayload) {
    const data = await this.authService.getMe(user.sub);
    return { success: true, data };
  }

  @Post('change-password')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Cambiar contraseña del usuario autenticado' })
  async changePassword(
    @Body(new ZodValidationPipe(ChangePasswordSchema)) body: ChangePasswordInput,
    @CurrentUser() user: AuthTokenPayload,
    @Req() req: FastifyRequest,
  ) {
    await this.authService.changePassword(user.sub, body.currentPassword, body.newPassword);

    await this.auditService.log({
      userId: user.sub,
      tenantId: user.tenantId ?? undefined,
      action: 'auth.change_password',
      ipAddress: req.ip,
    });

    return { success: true };
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Cerrar sesión' })
  async logout(@CurrentUser() user: AuthTokenPayload, @Req() req: FastifyRequest) {
    await this.authService.logout(user.jti);

    await this.auditService.log({
      userId: user.sub,
      tenantId: user.tenantId ?? undefined,
      action: 'auth.logout',
      ipAddress: req.ip,
    });

    return { success: true };
  }

  @Post('totp/setup')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Obtener secreto TOTP para configuración' })
  totpSetup(@CurrentUser() _user: AuthTokenPayload) {
    const result = this.authService.generateTotpSecret();
    return { success: true, data: result };
  }

  @Post('totp/enable')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Activar TOTP' })
  async totpEnable(
    @Body(new ZodValidationPipe(EnableTotpSchema)) body: EnableTotpInput,
    @CurrentUser() user: AuthTokenPayload,
    @Req() req: FastifyRequest,
  ) {
    await this.authService.enableTotp(user.sub, body.secret, body.code);

    await this.auditService.log({
      userId: user.sub,
      tenantId: user.tenantId ?? undefined,
      action: 'auth.totp_enabled',
      ipAddress: req.ip,
    });

    return { success: true };
  }

  @Post('totp/disable')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Desactivar TOTP' })
  async totpDisable(
    @CurrentUser() user: AuthTokenPayload,
    @Req() req: FastifyRequest,
  ) {
    await this.authService.disableTotp(user.sub);

    await this.auditService.log({
      userId: user.sub,
      tenantId: user.tenantId ?? undefined,
      action: 'auth.totp_disabled',
      ipAddress: req.ip,
    });

    return { success: true };
  }
}
