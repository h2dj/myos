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

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** URL 등에서 온 id가 UUID 형식이 아니면 DB 오류 대신 NotFound로 처리하기 위한 검사 */
export function isUuid(value: string): boolean {
  return UUID_RE.test(value);
}
