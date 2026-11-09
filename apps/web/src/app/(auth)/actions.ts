'use server';

import { ensureUserProfile } from '@myos/domain';
import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { db } from '@/server/db';
import { devUserId, signDevSession } from '@/server/auth/dev-session';
import {
  DEV_SESSION_COOKIE,
  DEV_SESSION_MAX_AGE,
  PASSWORD_RESET_COOKIE,
  PASSWORD_RESET_MAX_AGE,
  authMode,
} from '@/server/auth/mode';
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
  const origin = await appOrigin();
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

const emailSchema = z.object({ email: z.email('올바른 이메일을 입력하세요.') });
const newPasswordSchema = z
  .object({
    password: z.string().min(8, '비밀번호는 8자 이상이어야 합니다.').max(72),
    confirm: z.string(),
  })
  .refine((v) => v.password === v.confirm, { message: '두 비밀번호가 일치하지 않습니다.' });

/** 비밀번호 찾기: 재설정 메일 발송. 가입 여부를 드러내지 않도록 결과 문구는 항상 같다. */
export async function requestPasswordReset(
  _: AuthFormState,
  form: FormData,
): Promise<AuthFormState> {
  const parsed = emailSchema.safeParse(Object.fromEntries(form));
  const email = String(form.get('email') ?? '');
  if (!parsed.success) return { error: parsed.error.issues[0]!.message, email };

  if (authMode() === 'dev') {
    return {
      message: '개발 모드에서는 메일을 보내지 않습니다. 아무 8자 이상 비밀번호로 로그인하세요.',
      email,
    };
  }
  const supabase = await createSupabaseServerClient();
  // 링크는 등록된 /auth/confirm으로 돌아온다. 같은 브라우저(PKCE)에서 열리므로 쿠키로 재설정 흐름임을 표시한다.
  const { error } = await supabase.auth.resetPasswordForEmail(parsed.data.email, {
    redirectTo: `${await appOrigin()}/auth/confirm`,
  });
  if (error?.status === 429) {
    return { error: '요청이 너무 많습니다. 잠시 후 다시 시도하세요.', email };
  }
  (await cookies()).set(PASSWORD_RESET_COOKIE, '1', {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/auth/confirm',
    maxAge: PASSWORD_RESET_MAX_AGE,
  });
  return {
    message:
      '가입된 이메일이면 비밀번호 재설정 링크를 보냈습니다. 메일의 링크를 이 브라우저에서 여세요.',
    email,
  };
}

/** 재설정 링크로 로그인된 상태(또는 로그인 상태)에서 새 비밀번호 저장 */
export async function updatePassword(_: AuthFormState, form: FormData): Promise<AuthFormState> {
  const parsed = newPasswordSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues[0]!.message };

  if (authMode() === 'dev') {
    return {
      message: '개발 모드에서는 비밀번호를 저장하지 않습니다. 아무 비밀번호로 로그인됩니다.',
    };
  }
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) {
    if (error.code === 'same_password') {
      return { error: '이전과 다른 비밀번호를 입력하세요.' };
    }
    if (error.code === 'weak_password') {
      return { error: '더 안전한 비밀번호를 입력하세요.' };
    }
    return { error: '비밀번호를 바꾸지 못했습니다. 재설정 링크를 다시 받아 시도하세요.' };
  }
  return { message: '비밀번호를 바꿨습니다. 다음 로그인부터 새 비밀번호를 사용하세요.' };
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

/** 메일 링크는 배포 주소(APP_URL)를 우선 쓰고, 없을 때만 요청 출처를 쓴다. */
async function appOrigin() {
  return (process.env.APP_URL || (await headers()).get('origin') || '').replace(/\/+$/, '');
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
