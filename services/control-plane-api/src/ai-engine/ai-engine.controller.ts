import { Controller, Post, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AiEngineService } from './ai-engine.service';
import { AnalyzeAbuseDto, ClassifyMailDto, DiagnoseSupportDto, ExtractInvoiceDto } from './ai-engine.dto';
import { UserRole, type AuthTokenPayload } from '@4nexa/types';

@ApiTags('AI Engine')
@ApiBearerAuth()
@Controller('ai')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AiEngineController {
  constructor(private readonly aiService: AiEngineService) {}

  @Post('abuse/analyze')
  @ApiOperation({ summary: 'Analiza un email en busca de abuso, spam o phishing' })
  @Roles(UserRole.SUPER_ADMIN, UserRole.PLATFORM_ADMIN, UserRole.TENANT_OWNER, UserRole.TENANT_ADMIN)
  async analyzeAbuse(
    @Body() dto: AnalyzeAbuseDto,
    @CurrentUser() user: AuthTokenPayload,
  ) {
    const data = await this.aiService.analyzeAbuse(user.tenantId ?? '', dto);
    return { success: true, data };
  }

  @Post('mail/classify')
  @ApiOperation({ summary: 'Clasifica un email en una categoría (inbox, spam, promotional...)' })
  @Roles(UserRole.SUPER_ADMIN, UserRole.PLATFORM_ADMIN, UserRole.TENANT_OWNER, UserRole.TENANT_ADMIN, UserRole.TENANT_MAIL_MANAGER)
  async classifyMail(@Body() dto: ClassifyMailDto) {
    const data = await this.aiService.classifyMail(dto);
    return { success: true, data };
  }

  @Post('support/diagnose')
  @ApiOperation({ summary: 'Diagnostica un problema de soporte con IA' })
  @Roles(UserRole.SUPER_ADMIN, UserRole.PLATFORM_ADMIN, UserRole.TENANT_OWNER, UserRole.TENANT_ADMIN, UserRole.TENANT_MAIL_MANAGER)
  async diagnoseSupport(
    @Body() dto: DiagnoseSupportDto,
    @CurrentUser() user: AuthTokenPayload,
  ) {
    const data = await this.aiService.diagnoseSupport(user.tenantId ?? '', dto.question, user.sub);
    return { success: true, data };
  }

  @Post('invoice/extract')
  @ApiOperation({ summary: 'Extrae datos estructurados de una factura en texto plano' })
  @Roles(UserRole.SUPER_ADMIN, UserRole.PLATFORM_ADMIN, UserRole.TENANT_OWNER, UserRole.TENANT_ADMIN)
  async extractInvoice(@Body() dto: ExtractInvoiceDto) {
    const data = await this.aiService.extractInvoiceData(dto.text);
    return { success: true, data };
  }
}

