import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
  ParseUUIDPipe,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import {
  NodeAutoAssignSchema,
  DrainNodeSchema,
  QuarantineNodeSchema,
  SetWarmupSchema,
  FindBestNodeQuerySchema,
  type NodeAutoAssignInput,
  type DrainNodeInput,
  type QuarantineNodeInput,
  type SetWarmupInput,
  type FindBestNodeQuery,
} from '@4nexa/validators';
import { NodeAssignmentService } from './node-assignment.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { UserRole } from '@4nexa/types';

@ApiTags('node-assignment')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('node-assignment')
export class NodeAssignmentController {
  constructor(private readonly nodeAssignment: NodeAssignmentService) {}

  // ─── GET /node-assignment/best-node ─────────────────────────────────────────

  @Get('best-node')
  @Roles(UserRole.SUPER_ADMIN, UserRole.PLATFORM_ADMIN)
  @ApiOperation({ summary: 'Obtiene el nodo con mayor score disponible' })
  bestNode(
    @Query(new ZodValidationPipe(FindBestNodeQuerySchema)) query: FindBestNodeQuery,
  ) {
    return this.nodeAssignment.findBestNode(query);
  }

  // ─── POST /node-assignment/tenant/:id ────────────────────────────────────────

  @Post('tenant/:id')
  @HttpCode(HttpStatus.OK)
  @Roles(UserRole.SUPER_ADMIN, UserRole.PLATFORM_ADMIN)
  @ApiOperation({ summary: 'Asigna un tenant al nodo óptimo o al indicado' })
  assignTenant(
    @Param('id', ParseUUIDPipe) tenantId: string,
    @Body(new ZodValidationPipe(NodeAutoAssignSchema)) body: NodeAutoAssignInput,
  ) {
    return this.nodeAssignment.assignTenantToNode(tenantId, body);
  }

  // ─── POST /node-assignment/domain/:id ────────────────────────────────────────

  @Post('domain/:id')
  @HttpCode(HttpStatus.OK)
  @Roles(UserRole.SUPER_ADMIN, UserRole.PLATFORM_ADMIN)
  @ApiOperation({ summary: 'Asigna un dominio al nodo óptimo o al indicado' })
  assignDomain(
    @Param('id', ParseUUIDPipe) domainId: string,
    @Body(new ZodValidationPipe(NodeAutoAssignSchema)) body: NodeAutoAssignInput,
  ) {
    return this.nodeAssignment.assignDomainToNode(domainId, body);
  }

  // ─── POST /node-assignment/drain/:id ─────────────────────────────────────────

  @Post('drain/:id')
  @HttpCode(HttpStatus.OK)
  @Roles(UserRole.SUPER_ADMIN, UserRole.PLATFORM_ADMIN)
  @ApiOperation({ summary: 'Inicia modo drain en un nodo y migra sus tenants/dominios' })
  drain(
    @Param('id', ParseUUIDPipe) nodeId: string,
    @Body(new ZodValidationPipe(DrainNodeSchema)) body: DrainNodeInput,
  ) {
    return this.nodeAssignment.drainNode(nodeId, body);
  }

  // ─── POST /node-assignment/quarantine/:id ────────────────────────────────────

  @Post('quarantine/:id')
  @HttpCode(HttpStatus.OK)
  @Roles(UserRole.SUPER_ADMIN, UserRole.PLATFORM_ADMIN)
  @ApiOperation({ summary: 'Pone un nodo en cuarentena' })
  quarantine(
    @Param('id', ParseUUIDPipe) nodeId: string,
    @Body(new ZodValidationPipe(QuarantineNodeSchema)) body: QuarantineNodeInput,
  ) {
    return this.nodeAssignment.quarantineNode(nodeId, body);
  }

  // ─── POST /node-assignment/reactivate/:id ────────────────────────────────────

  @Post('reactivate/:id')
  @HttpCode(HttpStatus.OK)
  @Roles(UserRole.SUPER_ADMIN, UserRole.PLATFORM_ADMIN)
  @ApiOperation({ summary: 'Reactiva un nodo desde DRAINING/QUARANTINED/MAINTENANCE' })
  reactivate(
    @Param('id', ParseUUIDPipe) nodeId: string,
  ) {
    return this.nodeAssignment.reactivateNode(nodeId);
  }

  // ─── POST /node-assignment/warmup/:id ────────────────────────────────────────

  @Post('warmup/:id')
  @HttpCode(HttpStatus.OK)
  @Roles(UserRole.SUPER_ADMIN, UserRole.PLATFORM_ADMIN)
  @ApiOperation({ summary: 'Actualiza el estado de warmup de un nodo' })
  setWarmup(
    @Param('id', ParseUUIDPipe) nodeId: string,
    @Body(new ZodValidationPipe(SetWarmupSchema)) body: SetWarmupInput,
  ) {
    return this.nodeAssignment.setWarmupStatus(nodeId, body);
  }
}
