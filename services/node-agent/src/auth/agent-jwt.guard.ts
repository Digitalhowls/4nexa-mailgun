import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import type { FastifyRequest } from 'fastify';
import type { AgentEnvConfig } from '../config/env.schema';

export interface AgentTokenPayload {
  sub: string;      // nodeId
  iss: string;      // 'control-plane'
  scope: string[];  // operaciones autorizadas
  iat: number;
  exp: number;
}

@Injectable()
export class AgentJwtGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    private readonly config: ConfigService<AgentEnvConfig, true>,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<FastifyRequest>();
    const authHeader = req.headers['authorization'];

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedException('Token de autenticación requerido');
    }

    const token = authHeader.slice(7);
    let payload: AgentTokenPayload;

    try {
      payload = this.jwtService.verify<AgentTokenPayload>(token, {
        secret: this.config.get('AGENT_JWT_SECRET'),
      });
    } catch {
      throw new UnauthorizedException('Token de agente inválido o expirado');
    }

    if (payload.iss !== 'control-plane') {
      throw new UnauthorizedException('Emisor del token no autorizado');
    }

    const expectedNodeId = this.config.get('AGENT_NODE_ID');
    if (payload.sub !== expectedNodeId) {
      throw new UnauthorizedException('Token no corresponde a este nodo');
    }

    return true;
  }
}
