import type { EmailOtpType, User } from '@supabase/supabase-js';
import { ensureUserProfile } from '@myos/domain';
import { NextResponse, type NextRequest } from 'next/server';
import { db } from '@/server/db';
import { PASSWORD_RESET_COOKIE } from '@/server/auth/mode';
import { createSupabaseServerClient } from '@/server/auth/supabase';

/**
 * 가입 확인·비밀번호 재설정 메일 링크 처리. 두 형식을 모두 받는다.
 * - Supabase 기본 템플릿({{ .ConfirmationURL }}): 확인 후 ?code=… 로 돌아온다 (PKCE)
 * - 직접 만든 템플릿: ?token_hash=…&type=email|recovery
 * 기본 템플릿은 재설정 여부를 알려주지 않으므로, 재설정을 요청한 브라우저에 남긴 쿠키로 구분한다.
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
    const recovery = type === 'recovery' || request.cookies.has(PASSWORD_RESET_COOKIE);
    const response = NextResponse.redirect(
      new URL(recovery ? '/reset-password' : '/dashboard', request.url),
    );
    if (recovery) response.cookies.delete({ name: PASSWORD_RESET_COOKIE, path: '/auth/confirm' });
    return response;
  }
  return NextResponse.redirect(new URL('/login?error=confirm', request.url));
}
