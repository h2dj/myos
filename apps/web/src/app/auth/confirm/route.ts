import type { EmailOtpType } from '@supabase/supabase-js';
import { ensureUserProfile } from '@myos/domain';
import { NextResponse, type NextRequest } from 'next/server';
import { db } from '@/server/db';
import { createSupabaseServerClient } from '@/server/auth/supabase';

/** 가입 확인 메일 링크 처리 (Supabase 이메일 템플릿의 token_hash 방식) */
export async function GET(request: NextRequest) {
  const tokenHash = request.nextUrl.searchParams.get('token_hash');
  const type = request.nextUrl.searchParams.get('type') as EmailOtpType | null;
  if (tokenHash && type) {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    if (!error && data.user?.email) {
      const name = data.user.user_metadata?.name;
      await ensureUserProfile(db, {
        id: data.user.id,
        email: data.user.email,
        name: typeof name === 'string' ? name : undefined,
      });
      return NextResponse.redirect(new URL('/dashboard', request.url));
    }
  }
  return NextResponse.redirect(new URL('/login?error=confirm', request.url));
}
