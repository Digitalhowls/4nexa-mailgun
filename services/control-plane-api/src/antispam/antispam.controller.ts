import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Param,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
  ParseUUIDPipe,
  Req,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import {
  UpsertAntispamPolicySchema,
  EvaluateMessageSchema,
  type UpsertAntispamPolicyInput,
  type EvaluateMessageInput,
} from '@4nexa/validators';
import { AntispamService } from './antispam.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { UserRole } from '@4nexa/types';
import type { FastifyRequest } from 'fastify';

@ApiTags('antispam')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('antispam')
export class AntispamController {
  constructor(private readonly svc: AntispamService) {}

  // ─── GET /antispam/policy/:domainId ───────────────────────────────────────

  @Get('policy/:domainId')
  @Roles(
    UserRole.SUPER_ADMIN,
    UserRole.PLATFORM_ADMIN,
    UserRole.READ_ONLY_AUDITOR,
  )
  @ApiOperation({ summary: 'Obtener política antispam de un dominio' })
  async getPolicy(@Param('domainId', ParseUUIDPipe) domainId: string) {
    return { success: true, data: await this.svc.getPolicy(domainId) };
  }

  // ─── PUT /antispam/policy/:domainId ───────────────────────────────────────

  @Put('policy/:domainId')
  @Roles(UserRole.SUPER_ADMIN, UserRole.PLATFORM_ADMIN)
  @ApiOperation({ summary: 'Crear o actualizar política antispam de un dominio (§27)' })
  async upsertPolicy(
    @Param('domainId', ParseUUIDPipe) domainId: string,
    @Body(new ZodValidationPipe(UpsertAntispamPolicySchema)) body: UpsertAntispamPolicyInput,
    @Req() req: FastifyRequest & { user?: { userId?: string } },
  ) {
    return { success: true, data: await this.svc.upsertPolicy(domainId, body, req.user?.userId) };
  }

  // ─── DELETE /antispam/policy/:domainId ────────────────────────────────────

  @Delete('policy/:domainId')
  @Roles(UserRole.SUPER_ADMIN, UserRole.PLATFORM_ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Eliminar política antispam de un dominio' })
  async deletePolicy(
    @Param('domainId', ParseUUIDPipe) domainId: string,
    @Req() req: FastifyRequest & { user?: { userId?: string } },
  ) {
    return { success: true, data: await this.svc.deletePolicy(domainId, req.user?.userId) };
  }

  // ─── POST /antispam/evaluate/:domainId ────────────────────────────────────

  @Post('evaluate/:domainId')
  @Roles(UserRole.SUPER_ADMIN, UserRole.PLATFORM_ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Evaluar un remitente/mensaje contra la política del dominio (§27)' })
  async evaluateMessage(
    @Param('domainId', ParseUUIDPipe) domainId: string,
    @Body(new ZodValidationPipe(EvaluateMessageSchema)) body: EvaluateMessageInput,
  ) {
    return { success: true, data: await this.svc.evaluateMessage(domainId, body) };
  }
}
