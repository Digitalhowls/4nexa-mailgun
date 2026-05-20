import { Controller, Post, Body, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AiEngineService } from './ai-engine.service';
import { UserRole, type AuthTokenPayload } from '@4nexa/types';

@Controller('ai')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AiEngineController {
  constructor(private readonly aiService: AiEngineService) {}

  @Post('abuse/analyze')
  @Roles(UserRole.SUPER_ADMIN, UserRole.PLATFORM_ADMIN, UserRole.TENANT_OWNER, UserRole.TENANT_ADMIN)
  async analyzeAbuse(
    @Body() body: { subject: string; body: string; fromEmail: string; ip: string },
    @CurrentUser() user: AuthTokenPayload,
  ) {
    const data = await this.aiService.analyzeAbuse(user.tenantId ?? '', body);
    return { success: true, data };
  }

  @Post('mail/classify')
  @Roles(UserRole.SUPER_ADMIN, UserRole.PLATFORM_ADMIN, UserRole.TENANT_OWNER, UserRole.TENANT_ADMIN, UserRole.TENANT_MAIL_MANAGER)
  async classifyMail(
    @Body() body: { subject: string; body: string; fromEmail: string },
  ) {
    const data = await this.aiService.classifyMail(body);
    return { success: true, data };
  }

  @Post('support/diagnose')
  @Roles(UserRole.SUPER_ADMIN, UserRole.PLATFORM_ADMIN, UserRole.TENANT_OWNER, UserRole.TENANT_ADMIN, UserRole.TENANT_MAIL_MANAGER)
  async diagnoseSupport(
    @Body() body: { question: string },
    @CurrentUser() user: AuthTokenPayload,
  ) {
    const data = await this.aiService.diagnoseSupport(user.tenantId ?? '', body.question, user.sub);
    return { success: true, data };
  }

  @Post('invoice/extract')
  @Roles(UserRole.SUPER_ADMIN, UserRole.PLATFORM_ADMIN, UserRole.TENANT_OWNER, UserRole.TENANT_ADMIN)
  async extractInvoice(@Body() body: { text: string }) {
    const data = await this.aiService.extractInvoiceData(body.text);
    return { success: true, data };
  }
}
