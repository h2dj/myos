import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { verifyDevSession } from './server/auth/dev-session';
import { DEV_SESSION_COOKIE, authMode } from './server/auth/mode';

const PUBLIC_PATHS = ['/login', '/signup', '/auth/'];

/**
 * 1차 관문: 세션이 없으면 /login으로 보내고, Supabase 세션 토큰을 갱신한다.
 * 실제 사용자 검증과 권한 검사는 서버(requireSession, 도메인 서비스)에서 다시 한다.
 */
export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isPublic = PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p));

  let response = NextResponse.next({ request });
  let signedIn: boolean;

  if (authMode() === 'dev') {
    // 서명·만료까지 확인해야 서버의 판단과 어긋나 리다이렉트가 반복되지 않는다
    signedIn = verifyDevSession(request.cookies.get(DEV_SESSION_COOKIE)?.value) !== null;
  } else {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !key) return response; // 설정 오류는 페이지에서 안내한다
    const supabase = createServerClient(url, key, {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (toSet) => {
          for (const { name, value } of toSet) request.cookies.set(name, value);
          response = NextResponse.next({ request });
          for (const { name, value, options } of toSet) response.cookies.set(name, value, options);
        },
      },
    });
    const { data } = await supabase.auth.getUser();
    signedIn = Boolean(data.user);
  }

  if (!signedIn && !isPublic) {
    const login = new URL('/login', request.url);
    if (pathname !== '/') login.searchParams.set('next', pathname);
    const redirect = NextResponse.redirect(login);
    if (request.cookies.has(DEV_SESSION_COOKIE)) redirect.cookies.delete(DEV_SESSION_COOKIE);
    return redirect;
  }
  if (signedIn && (pathname === '/login' || pathname === '/signup')) {
    return NextResponse.redirect(new URL('/dashboard', request.url));
  }
  return response;
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|.*\\.(?:svg|png|ico)$).*)',
  ],
};
