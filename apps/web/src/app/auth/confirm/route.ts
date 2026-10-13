import type { EmailOtpType, User } from '@supabase/supabase-js';
import { ensureUserProfile } from '@myos/domain';
import { NextResponse, type NextRequest } from 'next/server';
import { db } from '@/server/db';
import { createSupabaseServerClient } from '@/server/auth/supabase';

/**
 * 가입 확인 메일 링크 처리. 두 형식을 모두 받는다.
 * - Supabase 기본 템플릿({{ .ConfirmationURL }}): 확인 후 ?code=… 로 돌아온다 (PKCE)
 * - 직접 만든 템플릿: ?token_hash=…&type=email
 */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const code = params.get('code');
  const tokenHash = params.get('token_hash');
  const type = params.get('type') as EmailOtpType | null;
  const supabase = await createSupabaseServerClient();

  let user: User | null = null;
  if (code) {
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) user = data.user;
  } else if (tokenHash && type) {
    const { data, error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    if (!error) user = data.user;
  }

  if (user?.email) {
    const name = user.user_metadata?.name;
    await ensureUserProfile(db, {
      id: user.id,
      email: user.email,
      name: typeof name === 'string' ? name : undefined,
    });
    return NextResponse.redirect(new URL('/dashboard', request.url));
  }
  return NextResponse.redirect(new URL('/login?error=confirm', request.url));
}
