import {
  PipeTransform,
  ArgumentMetadata,
  BadRequestException,
  Injectable,
} from '@nestjs/common';
import { ZodSchema, ZodError } from 'zod';

@Injectable()
export class ZodValidationPipe implements PipeTransform {
  constructor(private readonly schema: ZodSchema) {}

  transform(value: unknown, _metadata: ArgumentMetadata): unknown {
    const result = this.schema.safeParse(value);
    if (!result.success) {
      const errors = (result.error as ZodError).errors.map((e) => ({
        field: e.path.join('.'),
        message: e.message,
      }));
      throw new BadRequestException({
        message: 'Error de validación',
        code: 'VALIDATION_ERROR',
        errors,
      });
    }
    return result.data;
  }
}
