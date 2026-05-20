import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
  Req,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { SimulateDrSchema, DR_SCENARIOS, type SimulateDrInput } from '@4nexa/validators';
import { DisasterRecoveryService } from './disaster-recovery.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { UserRole } from '@4nexa/types';
import type { FastifyRequest } from 'fastify';

@ApiTags('disaster-recovery')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('dr')
export class DisasterRecoveryController {
  constructor(private readonly svc: DisasterRecoveryService) {}

  // ─── GET /dr/status ───────────────────────────────────────────────────────

  @Get('status')
  @Roles(
    UserRole.SUPER_ADMIN,
    UserRole.PLATFORM_ADMIN,
    UserRole.READ_ONLY_AUDITOR,
  )
  @ApiOperation({ summary: 'Estado de salud del sistema desde perspectiva DR (§25)' })
  async getStatus() {
    return { success: true, data: await this.svc.getSystemStatus() };
  }

  // ─── GET /dr/plans/:scenario ──────────────────────────────────────────────

  @Get('plans/:scenario')
  @Roles(
    UserRole.SUPER_ADMIN,
    UserRole.PLATFORM_ADMIN,
    UserRole.READ_ONLY_AUDITOR,
  )
  @ApiOperation({ summary: 'Obtener el plan DR para un escenario concreto' })
  async getPlan(@Param('scenario') scenario: string) {
    // Validar escenario manualmente para devolver 400 limpio
    if (!DR_SCENARIOS.includes(scenario as any)) {
      return { error: `Escenario desconocido. Válidos: ${DR_SCENARIOS.join(', ')}` };
    }
    return { success: true, data: await this.svc.simulate(
      { scenario: scenario as SimulateDrInput['scenario'], dryRun: true },
      undefined,
    ) };
  }

  // ─── POST /dr/simulate ────────────────────────────────────────────────────

  @Post('simulate')
  @Roles(UserRole.SUPER_ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Simular (dry-run) o ejecutar escenario de Disaster Recovery (§25)' })
  async simulate(
    @Body(new ZodValidationPipe(SimulateDrSchema)) body: SimulateDrInput,
    @Req() req: FastifyRequest & { user?: { userId?: string } },
  ) {
    return { success: true, data: await this.svc.simulate(body, req.user?.userId) };
  }
}
