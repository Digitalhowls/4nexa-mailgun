import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  ParseUUIDPipe,
  UseGuards,
  HttpCode,
  HttpStatus,
  Req,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { FastifyRequest } from 'fastify';
import { PlansService } from './plans.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { CreatePlanSchema, UpdatePlanSchema, type CreatePlanInput, type UpdatePlanInput } from '@4nexa/validators';
import { UserRole } from '@4nexa/types';
import { AuditService } from '../audit/audit.service';
import type { AuthTokenPayload } from '@4nexa/types';

@ApiTags('plans')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('plans')
export class PlansController {
  constructor(
    private readonly plansService: PlansService,
    private readonly auditService: AuditService,
  ) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @Roles(UserRole.SUPER_ADMIN, UserRole.PLATFORM_ADMIN)
  @ApiOperation({ summary: 'Crear plan' })
  async create(
    @Body(new ZodValidationPipe(CreatePlanSchema)) body: CreatePlanInput,
    @CurrentUser() user: AuthTokenPayload,
    @Req() req: FastifyRequest,
  ) {
    const plan = await this.plansService.create(body);
    await this.auditService.log({
      userId: user.sub,
      action: 'plan.created',
      entityType: 'plan',
      entityId: plan.id,
      ipAddress: req.ip,
    });
    return { success: true, data: plan };
  }

  @Get()
  @Roles(UserRole.SUPER_ADMIN, UserRole.PLATFORM_ADMIN, UserRole.SUPPORT_AGENT)
  @ApiOperation({ summary: 'Listar planes' })
  async findAll() {
    const plans = await this.plansService.findAll();
    return { success: true, data: plans };
  }

  @Get(':id')
  @Roles(UserRole.SUPER_ADMIN, UserRole.PLATFORM_ADMIN, UserRole.SUPPORT_AGENT)
  @ApiOperation({ summary: 'Obtener plan por ID' })
  async findOne(@Param('id', ParseUUIDPipe) id: string) {
    const plan = await this.plansService.findOne(id);
    return { success: true, data: plan };
  }

  @Patch(':id')
  @Roles(UserRole.SUPER_ADMIN, UserRole.PLATFORM_ADMIN)
  @ApiOperation({ summary: 'Actualizar plan' })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(UpdatePlanSchema)) body: UpdatePlanInput,
    @CurrentUser() user: AuthTokenPayload,
    @Req() req: FastifyRequest,
  ) {
    const plan = await this.plansService.update(id, body);
    await this.auditService.log({
      userId: user.sub,
      action: 'plan.updated',
      entityType: 'plan',
      entityId: plan.id,
      metadata: body as Record<string, unknown>,
      ipAddress: req.ip,
    });
    return { success: true, data: plan };
  }

  @Delete(':id')
  @Roles(UserRole.SUPER_ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Eliminar plan' })
  async remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthTokenPayload,
    @Req() req: FastifyRequest,
  ) {
    await this.plansService.remove(id);
    await this.auditService.log({
      userId: user.sub,
      action: 'plan.deleted',
      entityType: 'plan',
      entityId: id,
      ipAddress: req.ip,
    });
  }
}
