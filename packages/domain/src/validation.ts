import type { z } from 'zod';
import { ValidationError } from './errors';

export function parse<S extends z.ZodType>(schema: S, input: unknown): z.output<S> {
  const result = schema.safeParse(input);
  if (!result.success) {
    const first = result.error.issues[0];
    throw new ValidationError(
      first ? `${first.path.join('.') || '입력'}: ${first.message}` : '잘못된 입력',
    );
  }
  return result.data;
}
