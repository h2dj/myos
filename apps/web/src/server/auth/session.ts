import 'server-only';
import {
  ensureUserProfile,
  getProfile,
  listWorkspaces,
  NotFoundError,
  type Actor,
} from '@myos/domain';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { cache } from 'react';
import { db } from '../db';
import { measure } from '../performance';
import { devUserId, verifyDevSession } from './dev-session';
import { DEV_SESSION_COOKIE, authMode } from './mode';
import { createSupabaseServerClient } from './supabase';

export interface AuthIdentity {
  id: string;
  email: string;
  name?: string;
}

/** 인증 공급자에서 확인한 현재 사용자 (프로필 테이블과 무관) */
export const getIdentity = cache(async (): Promise<AuthIdentity | null> => {
  if (authMode() === 'dev') {
    const email = verifyDevSession((await cookies()).get(DEV_SESSION_COOKIE)?.value);
    return email ? { id: devUserId(email), email } : null;
  }
  const supabase = await createSupabaseServerClient();
  // getClaims()는 토큰 서명을 검증하므로 쿠키 위조에 안전하다. 비대칭 서명 키면 JWKS(캐시)로
  // 로컬 검증해 요청마다 Auth 서버를 왕복하지 않고, 대칭 키면 getUser()처럼 서버에서 검증한다.
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (!claims?.sub || typeof claims.email !== 'string' || !claims.email) return null;
  const name = (claims.user_metadata as Record<string, unknown> | undefined)?.name;
  return {
    id: claims.sub,
    email: claims.email,
    name: typeof name === 'string' ? name : undefined,
  };
});

export const WORKSPACE_COOKIE = 'myos-workspace';

/**
 * 로그인한 사용자, 프로필, 현재 공간을 반환한다. 미로그인 시 /login으로 보낸다.
 * 프로필이 아직 없으면(첫 로그인) 개인 공간과 함께 만든다.
 */
export const requireSession = cache(async () => {
  const identity = await measure('session', 'identity', getIdentity);
  if (!identity) redirect('/login');

  const actor: Actor = { userId: identity.id };
  // 공간 목록과 프로필은 서로 독립이라 함께 읽는다 (DB 왕복 1회 절약).
  // 첫 로그인이라 프로필이 없으면 만든 뒤 다시 읽는다.
  const load = () =>
    Promise.all([
      measure('session', 'workspaces', () => listWorkspaces(db, actor)),
      measure('session', 'profile', () => getProfile(db, actor)).catch((err: unknown) => {
        if (err instanceof NotFoundError) return null;
        throw err;
      }),
    ]);
  let [workspaces, profile] = await load();
  if (workspaces.length === 0 || !profile) {
    await ensureUserProfile(db, identity);
    [workspaces, profile] = await load();
  }
  const user = profile ?? (await getProfile(db, actor));

  const selected = (await cookies()).get(WORKSPACE_COOKIE)?.value;
  const workspace = workspaces.find((w) => w.id === selected) ?? workspaces[0]!;

  return { actor, user, workspace, workspaces };
});

export type Session = Awaited<ReturnType<typeof requireSession>>;
