import 'server-only';
import { createMailer, type EngineDeps } from '@myos/domain';

/** 웹에서 '지금 실행'할 때 쓰는 자동화 의존성 (워커와 같은 환경 변수) */
export function engineDeps(): EngineDeps {
  return {
    mailer: createMailer(),
    appUrl: process.env.APP_URL ?? 'http://localhost:3000',
  };
}
