import 'server-only';
import { DomainError } from '@myos/domain';
import { revalidatePath } from 'next/cache';
import { requireSession, type Session } from './auth/session';

export type ActionResult<T = undefined> = { ok: true; data: T } | { ok: false; error: string };

/**
 * 서버 액션 공통 래퍼: 세션 확인 → 실행 → 관련 화면 갱신.
 * 도메인 오류(권한·검증·없음)는 사용자에게 보여줄 메시지로 바꾼다.
 */
export async function runAction<T>(
  fn: (session: Session) => Promise<T>,
  revalidate: string[] = [],
): Promise<ActionResult<T>> {
  const session = await requireSession();
  try {
    const data = await fn(session);
    for (const path of revalidate) revalidatePath(path, 'layout');
    return { ok: true, data };
  } catch (err) {
    if (err instanceof DomainError) return { ok: false, error: err.message };
    throw err;
  }
}

/** 폼 값 읽기 도우미 */
export function str(form: FormData, key: string): string | undefined {
  const v = form.get(key);
  return typeof v === 'string' && v.trim() !== '' ? v.trim() : undefined;
}

export function tagList(form: FormData, key = 'tags'): string[] | undefined {
  const v = form.get(key);
  if (typeof v !== 'string') return undefined;
  return v
    .split(',')
    .map((t) => t.trim().replace(/^#/, ''))
    .filter(Boolean);
}
