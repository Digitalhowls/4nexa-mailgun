import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  UseGuards,
  Req,
  ParseUUIDPipe,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { RotateDkimSchema, type RotateDkimInput } from '@4nexa/validators';
import { CredentialRotationService } from './credential-rotation.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { UserRole } from '@4nexa/types';
import type { FastifyRequest } from 'fastify';

@ApiTags('credentials')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('credentials')
export class CredentialRotationController {
  constructor(private readonly svc: CredentialRotationService) {}

  // ─── GET /credentials/dkim/:domainId ─────────────────────────────────────

  @Get('dkim/:domainId')
  @Roles(
    UserRole.SUPER_ADMIN,
    UserRole.PLATFORM_ADMIN,
    UserRole.READ_ONLY_AUDITOR,
  )
  @ApiOperation({ summary: 'Estado actual de credenciales DKIM de un dominio' })
  async getDkimStatus(@Param('domainId', ParseUUIDPipe) domainId: string) {
    return { success: true, data: await this.svc.getDkimStatus(domainId) };
  }

  // ─── POST /credentials/rotate-dkim/:domainId ─────────────────────────────

  @Post('rotate-dkim/:domainId')
  @Roles(UserRole.SUPER_ADMIN, UserRole.PLATFORM_ADMIN)
  @ApiOperation({ summary: 'Rotar claves DKIM de un dominio (§23)' })
  async rotateDkim(
    @Param('domainId', ParseUUIDPipe) domainId: string,
    @Body(new ZodValidationPipe(RotateDkimSchema)) body: RotateDkimInput,
    @Req() req: FastifyRequest & { user?: { userId?: string } },
  ) {
    return { success: true, data: await this.svc.rotateDkim(domainId, body, req.user?.userId) };
  }
}
