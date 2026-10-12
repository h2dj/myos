/**
 * 인증 모드
 * - supabase: 운영 기본값. 이메일+비밀번호 (확정 사항 #1)
 * - dev: Supabase 없이 로컬 개발·E2E 테스트용. AUTH_MODE=dev로만 켜지고 운영 빌드에서는 거부된다.
 */
export type AuthMode = 'supabase' | 'dev';

export function authMode(): AuthMode {
  if (process.env.AUTH_MODE === 'dev') {
    if (process.env.NODE_ENV === 'production' && process.env.ALLOW_DEV_AUTH !== '1') {
      throw new Error('AUTH_MODE=dev는 운영 환경에서 사용할 수 없습니다.');
    }
    return 'dev';
  }
  return 'supabase';
}

export const DEV_SESSION_COOKIE = 'myos-dev-session';
/** 세션 만료 (AUTH-01). Supabase는 대시보드의 세션 설정을 따른다. */
export const DEV_SESSION_MAX_AGE = 60 * 60 * 12;
