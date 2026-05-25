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

    // ── Verificación mTLS: CN del certificado cliente ────────────────────────
    // Si el agente arrancó con mTLS, Fastify expone el cert cliente en req.socket.
    // Verificamos que el CN sea 'control-plane' para asegurar que solo el CP
    // puede llamar al agente (autenticación mutua).
    const mtlsEnabled = Boolean(
      this.config.get('AGENT_TLS_CERT_PEM') &&
      this.config.get('AGENT_TLS_KEY_PEM') &&
      this.config.get('AGENT_TLS_CA_PEM'),
    );

    if (mtlsEnabled) {
       
      const socket = (req.raw as any)?.socket;
      const peerCert = socket?.getPeerCertificate?.() as { subject?: { CN?: string } } | undefined;

      if (!peerCert || !peerCert.subject?.CN) {
        throw new UnauthorizedException('Certificado cliente mTLS requerido');
      }

      // El CN del cert cliente del CP debe ser 'control-plane'
      if (peerCert.subject.CN !== 'control-plane') {
        throw new UnauthorizedException(
          `Certificado cliente no autorizado: CN="${peerCert.subject.CN}"`,
        );
      }
    }

    return true;
  }
}
