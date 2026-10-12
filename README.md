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
pnpm dev              # http://localhost:3000
pnpm dev:worker       # 별도 터미널
```

## 검사

```bash
pnpm format:check && pnpm lint && pnpm typecheck && pnpm test
```

스키마를 바꾸면 `pnpm db:generate --name <설명>`으로 마이그레이션을 만들고 함께 커밋합니다.
CI는 스키마와 마이그레이션이 어긋나면 실패합니다.
