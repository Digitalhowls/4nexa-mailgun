import { Controller, Post, Body, Headers, UseGuards, BadRequestException } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { OrizonService } from './orizon.service';
import { UserRole, type AuthTokenPayload } from '@4nexa/types';

@Controller('orizon')
export class OrizonController {
  constructor(private readonly orizonService: OrizonService) {}

  @Post('sync')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.SUPER_ADMIN, UserRole.PLATFORM_ADMIN, UserRole.TENANT_OWNER)
  async syncTenant(@CurrentUser() user: AuthTokenPayload) {
    const data = await this.orizonService.syncTenant(user.tenantId ?? '', user.sub);
    return { success: true, data };
  }

  /** Webhook público — autenticado mediante HMAC, sin JWT */
  @Post('webhook')
  async handleWebhook(
    @Body() body: Record<string, unknown>,
    @Headers('x-4nexa-signature') signature: string,
  ) {
    const rawBody = JSON.stringify(body);
    const valid = this.orizonService.verifyWebhookSignature(rawBody, signature ?? '');
    if (!valid) throw new BadRequestException('Firma HMAC inválida');
    await this.orizonService.handleWebhook(body);
    return { success: true, data: null };
  }
}
