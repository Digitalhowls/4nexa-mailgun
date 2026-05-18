// ─── Envelope de respuesta ────────────────────────────────────────────────────

export interface ApiResponse<T> {
  success: true;
  data: T;
  meta?: ApiMeta;
}

export interface ApiError {
  success: false;
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
}

export interface ApiMeta {
  total?: number;
  page?: number;
  pageSize?: number;
  totalPages?: number;
}

export type ApiResult<T> = ApiResponse<T> | ApiError;

// ─── Paginación ───────────────────────────────────────────────────────────────

export interface PaginationQuery {
  page?: number;
  pageSize?: number;
}

export interface PaginatedResult<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

// ─── Códigos de error conocidos ───────────────────────────────────────────────

export const ApiErrorCode = {
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  CONFLICT: 'CONFLICT',
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  TENANT_SUSPENDED: 'TENANT_SUSPENDED',
  TENANT_NOT_FOUND: 'TENANT_NOT_FOUND',
  DOMAIN_NOT_VERIFIED: 'DOMAIN_NOT_VERIFIED',
  DOMAIN_NOT_FOUND: 'DOMAIN_NOT_FOUND',
  MAILBOX_NOT_FOUND: 'MAILBOX_NOT_FOUND',
  MAILBOX_QUOTA_EXCEEDED: 'MAILBOX_QUOTA_EXCEEDED',
  PLAN_LIMIT_EXCEEDED: 'PLAN_LIMIT_EXCEEDED',
  NODE_NOT_AVAILABLE: 'NODE_NOT_AVAILABLE',
  INVALID_CREDENTIALS: 'INVALID_CREDENTIALS',
  TOKEN_EXPIRED: 'TOKEN_EXPIRED',
  TOKEN_REVOKED: 'TOKEN_REVOKED',
  TOTP_REQUIRED: 'TOTP_REQUIRED',
  TOTP_INVALID: 'TOTP_INVALID',
} as const;

export type ApiErrorCode = (typeof ApiErrorCode)[keyof typeof ApiErrorCode];
