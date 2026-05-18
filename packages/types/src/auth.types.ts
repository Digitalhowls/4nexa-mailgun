import { User } from './user.types';

export interface AuthTokenPayload {
  sub: string;         // userId
  email: string;
  role: string;
  tenantId: string | null;
  jti: string;         // JWT ID for revocation
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;   // seconds
}

export interface AuthSession {
  user: Omit<User, 'deletedAt'>;
  tokens: AuthTokens;
}
