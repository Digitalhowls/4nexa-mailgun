import { z } from 'zod';
import { UserRole } from '@4nexa/types';

export const LoginSchema = z.object({
  email: z.string().email('Email inválido').max(254).toLowerCase(),
  password: z.string().min(1, 'La contraseña es obligatoria').max(128),
  totpCode: z
    .string()
    .length(6, 'El código TOTP debe tener 6 dígitos')
    .regex(/^\d{6}$/, 'El código TOTP debe ser numérico')
    .optional(),
});

export const RegisterUserSchema = z.object({
  email: z.string().email().max(254).toLowerCase(),
  password: z
    .string()
    .min(12, 'La contraseña debe tener al menos 12 caracteres')
    .max(128)
    .regex(/[A-Z]/, 'Debe contener al menos una mayúscula')
    .regex(/[a-z]/, 'Debe contener al menos una minúscula')
    .regex(/[0-9]/, 'Debe contener al menos un número')
    .regex(/[^A-Za-z0-9]/, 'Debe contener al menos un carácter especial'),
  role: z.nativeEnum(UserRole),
  tenantId: z.string().uuid().optional().nullable(),
});

export const RefreshTokenSchema = z.object({
  refreshToken: z.string().min(1),
});

export const ChangePasswordSchema = z
  .object({
    currentPassword: z.string().min(1),
    newPassword: z
      .string()
      .min(12)
      .max(128)
      .regex(/[A-Z]/)
      .regex(/[a-z]/)
      .regex(/[0-9]/)
      .regex(/[^A-Za-z0-9]/),
    confirmPassword: z.string().min(1),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: 'Las contraseñas no coinciden',
    path: ['confirmPassword'],
  });

export const EnableTotpSchema = z.object({
  secret: z.string().min(16, 'Secreto TOTP inválido'),
  code: z
    .string()
    .length(6, 'El código TOTP debe tener 6 dígitos')
    .regex(/^\d{6}$/, 'El código TOTP debe ser numérico'),
});

export type LoginInput = z.infer<typeof LoginSchema>;
export type RegisterUserInput = z.infer<typeof RegisterUserSchema>;
export type RefreshTokenInput = z.infer<typeof RefreshTokenSchema>;
export type ChangePasswordInput = z.infer<typeof ChangePasswordSchema>;
export type EnableTotpInput = z.infer<typeof EnableTotpSchema>;
