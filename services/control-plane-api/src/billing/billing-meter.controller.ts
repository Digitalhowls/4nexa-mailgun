import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
  ParseUUIDPipe,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import {
  BillingTransitionSchema,
  type BillingTransitionInput,
} from '@4nexa/validators';
import { BillingMeterService } from './billing-meter.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { UserRole } from '@4nexa/types';

@ApiTags('billing')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('billing')
export class BillingMeterController {
  constructor(private readonly billing: BillingMeterService) {}

  // ─── GET /billing/meter/:tenantId ─────────────────────────────────────────────

  @Get('meter/:tenantId')
  @Roles(
    UserRole.SUPER_ADMIN,
    UserRole.PLATFORM_ADMIN,
    UserRole.BILLING_AGENT,
    UserRole.SUPPORT_AGENT,
  )
  @ApiOperation({ summary: 'Snapshot de uso actual del tenant' })
  async getMeterSnapshot(@Param('tenantId', ParseUUIDPipe) tenantId: string) {
    return { success: true, data: await this.billing.getMeterSnapshot(tenantId) };
  }

  // ─── POST /billing/transition/:tenantId ───────────────────────────────────────

  @Post('transition/:tenantId')
  @Roles(UserRole.SUPER_ADMIN, UserRole.PLATFORM_ADMIN, UserRole.BILLING_AGENT)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Transición de billing status (grace workflow)' })
  async transitionBillingStatus(
    @Param('tenantId', ParseUUIDPipe) tenantId: string,
    @Body(new ZodValidationPipe(BillingTransitionSchema))
    body: BillingTransitionInput,
  ) {
    return { success: true, data: await this.billing.transitionBillingStatus(tenantId, body) };
  }
}
