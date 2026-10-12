import 'server-only';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

export function supabaseEnv() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    throw new Error(
      'Supabase 환경 변수(NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY)가 없습니다. 로컬 개발은 AUTH_MODE=dev를 사용하세요.',
    );
  }
  return { url, key };
}

export async function createSupabaseServerClient() {
  // cookies()를 먼저 읽어 이 요청을 동적 렌더링으로 만든다(빌드 시 정적 생성 방지)
  const cookieStore = await cookies();
  const { url, key } = supabaseEnv();
  return createServerClient(url, key, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (toSet) => {
        try {
          for (const { name, value, options } of toSet) cookieStore.set(name, value, options);
        } catch {
          // 서버 컴포넌트에서는 쿠키를 쓸 수 없다. 세션 갱신은 proxy에서 처리된다.
        }
      },
    },
  });
}
