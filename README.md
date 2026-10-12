# MyOS

할 일·프로젝트·지식·일정·재정을 한 화면에서 판단하고 실행하는 개인 운영 시스템.
기획과 단계별 일정은 [docs/development-plan.md](docs/development-plan.md) 참고.

## 구조

| 경로            | 내용                                       |
| --------------- | ------------------------------------------ |
| `apps/web`      | Next.js(App Router) + Tailwind 웹앱 / PWA  |
| `apps/worker`   | pg-boss 기반 스케줄러·자동화 작업 실행기   |
| `packages/db`   | Drizzle 스키마·마이그레이션                |
| `packages/core` | 도메인 로직(기간 계산, 권한, 반복 규칙 등) |

## 로컬 실행

```bash
pnpm install
cp .env.example .env
pnpm db:up            # docker로 Postgres 16 실행 (또는 로컬 Postgres 사용)
set -a; . ./.env; set +a
pnpm db:migrate
pnpm dev              # http://localhost:3000 (AUTH_MODE=dev면 아무 이메일 + 8자 비밀번호로 로그인)
pnpm dev:worker       # 별도 터미널
```

## 검사

```bash
pnpm format:check && pnpm lint && pnpm typecheck && pnpm test   # domain 테스트는 DATABASE_URL의 Postgres 필요
pnpm build && pnpm --filter @myos/web e2e                       # E2E (dev 인증 모드)
```

## 인증

- 운영: Supabase Auth 이메일+비밀번호. `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` 설정.
  - 세션 만료(AUTH-01)는 Supabase 대시보드 Authentication → Sessions에서 설정(권장: 비활성 7일, 최대 30일).
  - 가입 확인 메일 템플릿의 링크는 `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email` 형식.
- 로컬·E2E: `AUTH_MODE=dev`. 서명된 쿠키(12시간)로 로그인되며, 운영 빌드(`NODE_ENV=production`)에서는
  `ALLOW_DEV_AUTH=1`이 함께 없으면 시작을 거부한다. **운영 환경에 두 값을 설정하지 말 것.**

스키마를 바꾸면 `pnpm db:generate --name <설명>`으로 마이그레이션을 만들고 함께 커밋합니다.
CI는 스키마와 마이그레이션이 어긋나면 실패합니다.
