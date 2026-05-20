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
  CheckSendPermissionSchema,
  type CheckSendPermissionInput,
} from '@4nexa/validators';
import { DeliverabilityService } from './deliverability.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { UserRole } from '@4nexa/types';

@ApiTags('deliverability')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('deliverability')
export class DeliverabilityController {
  constructor(private readonly deliverability: DeliverabilityService) {}

  // ─── GET /deliverability/domain/:id ──────────────────────────────────────────

  @Get('domain/:id')
  @Roles(
    UserRole.SUPER_ADMIN,
    UserRole.PLATFORM_ADMIN,
    UserRole.SUPPORT_AGENT,
    UserRole.ABUSE_ANALYST,
  )
  @ApiOperation({ summary: 'Estado de governance de un dominio' })
  async getDomainGovernance(
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return { success: true, data: await this.deliverability.getDomainGovernance(id) };
  }

  // ─── POST /deliverability/check ───────────────────────────────────────────────

  @Post('check')
  @Roles(
    UserRole.SUPER_ADMIN,
    UserRole.PLATFORM_ADMIN,
    UserRole.SUPPORT_AGENT,
    UserRole.ABUSE_ANALYST,
  )
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Verifica si un dominio puede enviar correo' })
  async checkSendPermission(
    @Body(new ZodValidationPipe(CheckSendPermissionSchema))
    body: CheckSendPermissionInput,
  ) {
    return { success: true, data: await this.deliverability.checkSendPermission(
      body.domainId,
      body.estimatedVolume,
    ) };
  }
}
