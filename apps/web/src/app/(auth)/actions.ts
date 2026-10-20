'use server';

import { ensureUserProfile } from '@myos/domain';
import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { db } from '@/server/db';
import { devUserId, signDevSession } from '@/server/auth/dev-session';
import { DEV_SESSION_COOKIE, DEV_SESSION_MAX_AGE, authMode } from '@/server/auth/mode';
import { WORKSPACE_COOKIE } from '@/server/auth/session';
import { createSupabaseServerClient } from '@/server/auth/supabase';

export interface AuthFormState {
  error?: string;
  message?: string;
  email?: string;
}

const credentials = z.object({
  email: z.email('올바른 이메일을 입력하세요.'),
  password: z.string().min(8, '비밀번호는 8자 이상이어야 합니다.').max(72),
});
const signupSchema = credentials.extend({
  name: z.string().trim().min(1, '이름을 입력하세요.').max(100),
});

/** 내부 경로만 허용 (오픈 리다이렉트 방지) */
function safeNext(value: FormDataEntryValue | null) {
  const next = typeof value === 'string' ? value : '';
  return next.startsWith('/') && !next.startsWith('//') ? next : '/dashboard';
}

export async function login(_: AuthFormState, form: FormData): Promise<AuthFormState> {
  const parsed = credentials.safeParse(Object.fromEntries(form));
  const email = String(form.get('email') ?? '');
  if (!parsed.success) return { error: parsed.error.issues[0]!.message, email };

  if (authMode() === 'dev') {
    await startDevSession(parsed.data.email);
  } else {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.auth.signInWithPassword(parsed.data);
    if (error || !data.user) {
      return { error: '이메일 또는 비밀번호가 올바르지 않습니다.', email };
    }
    await ensureUserProfile(db, { id: data.user.id, email: data.user.email! });
  }
  redirect(safeNext(form.get('next')));
}

export async function signup(_: AuthFormState, form: FormData): Promise<AuthFormState> {
  const parsed = signupSchema.safeParse(Object.fromEntries(form));
  const email = String(form.get('email') ?? '');
  if (!parsed.success) return { error: parsed.error.issues[0]!.message, email };
  const { name, ...creds } = parsed.data;

  if (authMode() === 'dev') {
    await startDevSession(creds.email, name);
    redirect('/dashboard');
  }

  const supabase = await createSupabaseServerClient();
  // 확인 메일 링크는 배포 주소(APP_URL)를 우선 쓰고, 없을 때만 요청 출처를 쓴다.
  const origin = (process.env.APP_URL || (await headers()).get('origin') || '').replace(/\/+$/, '');
  const { data, error } = await supabase.auth.signUp({
    ...creds,
    options: { data: { name }, emailRedirectTo: `${origin}/auth/confirm` },
  });
  if (error) return { error: error.message, email };
  if (!data.session) {
    return { message: '확인 메일을 보냈습니다. 메일의 링크를 눌러 가입을 완료하세요.', email };
  }
  await ensureUserProfile(db, { id: data.user!.id, email: creds.email, name });
  redirect('/dashboard');
}

export async function logout() {
  const store = await cookies();
  store.delete(WORKSPACE_COOKIE);
  if (authMode() === 'dev') {
    store.delete(DEV_SESSION_COOKIE);
  } else {
    const supabase = await createSupabaseServerClient();
    await supabase.auth.signOut();
  }
  redirect('/login');
}

async function startDevSession(email: string, name?: string) {
  await ensureUserProfile(db, { id: devUserId(email), email, name });
  (await cookies()).set(DEV_SESSION_COOKIE, signDevSession(email, DEV_SESSION_MAX_AGE), {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production' && process.env.ALLOW_DEV_AUTH !== '1',
    path: '/',
    maxAge: DEV_SESSION_MAX_AGE,
  });
}
