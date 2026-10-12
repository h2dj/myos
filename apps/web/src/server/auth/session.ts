import 'server-only';
import { ensureUserProfile, getProfile, listWorkspaces, type Actor } from '@myos/domain';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { cache } from 'react';
import { db } from '../db';
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
  // getUser()는 Auth 서버에 토큰을 검증하므로 쿠키 위조에 안전하다
  const { data } = await supabase.auth.getUser();
  if (!data.user?.email) return null;
  const name = data.user.user_metadata?.name;
  return {
    id: data.user.id,
    email: data.user.email,
    name: typeof name === 'string' ? name : undefined,
  };
});

export const WORKSPACE_COOKIE = 'myos-workspace';

/**
 * 로그인한 사용자, 프로필, 현재 공간을 반환한다. 미로그인 시 /login으로 보낸다.
 * 프로필이 아직 없으면(첫 로그인) 개인 공간과 함께 만든다.
 */
export const requireSession = cache(async () => {
  const identity = await getIdentity();
  if (!identity) redirect('/login');

  const actor: Actor = { userId: identity.id };
  let workspaces = await listWorkspaces(db, actor);
  if (workspaces.length === 0) {
    await ensureUserProfile(db, identity);
    workspaces = await listWorkspaces(db, actor);
  }
  const user = await getProfile(db, actor);

  const selected = (await cookies()).get(WORKSPACE_COOKIE)?.value;
  const workspace = workspaces.find((w) => w.id === selected) ?? workspaces[0]!;

  return { actor, user, workspace, workspaces };
});

export type Session = Awaited<ReturnType<typeof requireSession>>;
