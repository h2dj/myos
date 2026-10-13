# MyOS 배포 가이드 (검증용 1차 배포)

구성: **Supabase**(Postgres + 인증, 서울) · **Vercel**(웹, 서울 icn1) · **Fly.io**(자동화 워커, 도쿄) · Resend(이메일, 선택)

비밀 값(DB 비밀번호, 키)은 각 서비스 대시보드와 GitHub Secrets에만 넣고, 채팅·저장소에는 올리지 않는다.

## 0. 배포할 코드

Vercel은 기본적으로 `main` 브랜치를 운영 배포한다. 0~3단계 작업은 `phase-3-automation` 브랜치에 쌓여 있으므로
`phase-3-automation → main` PR을 만들어 CI 통과를 확인한 뒤 병합한다.
(병합 없이 보려면 Vercel이 브랜치마다 만드는 Preview 배포를 써도 된다. 이때는 2-3의 Redirect URL에 Preview 주소를 추가한다.)

## 1. Supabase

1. 새 프로젝트 생성 — Region: **Northeast Asia (Seoul)**. DB 비밀번호를 안전한 곳에 보관.
2. 상단 **Connect** 버튼에서 연결 문자열 두 개를 복사한다.
   | 용도              | 종류                   | 포트 | 쓰는 곳                                                    |
   | ----------------- | ---------------------- | ---- | ---------------------------------------------------------- |
   | 웹(서버리스)      | **Transaction pooler** | 6543 | Vercel `DATABASE_URL`                                      |
   | 마이그레이션·워커 | **Session pooler**     | 5432 | GitHub Secret `MIGRATION_DATABASE_URL`, Fly `DATABASE_URL` |
   - Direct connection은 IPv6 전용이라 GitHub Actions·Fly에서 안 될 수 있으므로 Session pooler를 쓴다.
   - 앱은 포트 6543이면 자동으로 prepared statement를 끈다(`packages/db/src/client.ts`).
3. **Project Settings → API**: `Project URL`, `anon`(publishable) 키 복사.
4. **Authentication → Sign In / Providers → Email**: 이메일 로그인 사용. 검증 단계에서 메일 확인을 생략하려면 "Confirm email"을 끈다
   (Supabase 기본 메일 발송은 시간당 몇 통으로 제한된다).
5. **Authentication → URL Configuration**
   - Site URL: `https://<Vercel 도메인>`
   - Redirect URLs: `https://<Vercel 도메인>/auth/confirm` (Preview도 쓰면 `https://*-<팀>.vercel.app/auth/confirm`)
   - 메일 템플릿은 기본값 그대로 두면 된다. `/auth/confirm`이 `?code=`(기본)와 `?token_hash=` 방식을 모두 처리한다.
6. (선택, Pro 요금제) **Authentication → Sessions**: 비활성 7일, 최대 30일 (AUTH-01 세션 만료).

> 보안: 마이그레이션 `0004_enable_rls`가 모든 테이블에 RLS를 켜고 anon/authenticated 권한을 회수한다.
> Supabase 공개 키로 REST API를 호출해도 데이터에 접근할 수 없다(아래 5-4에서 확인).

## 2. DB 마이그레이션

1. GitHub 저장소 → Settings → Environments → `production` 생성 → Secret `MIGRATION_DATABASE_URL` = Session pooler 문자열.
2. Actions → **DB 마이그레이션** → Run workflow (브랜치: 배포할 브랜치). 이후에는 `main`에 마이그레이션이 추가될 때 자동 실행된다.
   - 로컬에서 하려면: `DATABASE_URL='<Session pooler>' pnpm db:migrate`

## 3. Vercel (웹)

1. Add New → Project → GitHub `h2dj/myos` 가져오기.
2. **Root Directory: `apps/web`** (Framework: Next.js 자동 인식, 설치는 pnpm 워크스페이스로 자동 처리).
3. Environment Variables (Production·Preview):
   | 이름                            | 값                                     |
   | ------------------------------- | -------------------------------------- |
   | `DATABASE_URL`                  | Supabase **Transaction pooler** (6543) |
   | `NEXT_PUBLIC_SUPABASE_URL`      | Project URL                            |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | anon(publishable) 키                   |
   | `APP_URL`                       | `https://<Vercel 도메인>`              |
   | `RESEND_API_KEY`, `EMAIL_FROM`  | (선택) 이메일 알림                     |
   - **`AUTH_MODE`, `ALLOW_DEV_AUTH`는 절대 넣지 않는다.** (개발용 로그인: 아무 이메일로 로그인됨)
4. Deploy. 함수 리전은 `apps/web/vercel.json`에 서울(`icn1`)로 지정되어 있다.
5. 배포 도메인이 정해지면 1-5의 Site URL·Redirect URL과 `APP_URL`을 그 도메인으로 맞춘다.

## 4. Fly.io (자동화 워커) — 예약 실행이 필요할 때

워커가 없어도 웹은 동작한다. 이때 "지금 실행"은 되지만 예약 실행(브리핑·반복 할 일 생성 등)과 자동 재시도, 보존 기간 정리는 돌지 않는다.

```bash
# 저장소 루트에서 (flyctl 로그인 후)
fly launch --no-deploy --copy-config --config apps/worker/fly.toml --dockerfile apps/worker/Dockerfile
fly secrets set --config apps/worker/fly.toml \
  DATABASE_URL='<Session pooler 5432>' APP_URL='https://<Vercel 도메인>'
#  (선택) RESEND_API_KEY='...' EMAIL_FROM='MyOS <noreply@your-domain>'
fly deploy --config apps/worker/fly.toml --dockerfile apps/worker/Dockerfile
fly logs --config apps/worker/fly.toml   # "[worker] started" 확인
```

- 워커는 pg-boss 큐를 위해 `pgboss` 스키마를 스스로 만든다(Session pooler 필요, Transaction pooler 불가).
- 워커를 여러 대 띄워도 예약 회차는 한 번만 실행된다.

## 5. 확인 체크리스트

1. `https://<도메인>/api/health` → `{"ok":true,"migrations":5,"auth":"supabase"}`
2. `/signup`에서 가입 → (메일 확인을 켰다면 메일 링크) → 대시보드 진입, 사이드바에 이름 표시
3. 할 일 추가·완료 → 대시보드 수치 갱신, 로그아웃 후 재로그인 시 위젯 구성 유지
4. RLS 확인: 아래 요청에 `permission denied for table tasks`(42501) 오류가 나오면 정상이다. 데이터가 보이면 즉시 배포를 중단한다.
   ```bash
   curl 'https://<ref>.supabase.co/rest/v1/tasks?select=*' \
     -H "apikey: <anon 키>" -H "Authorization: Bearer <anon 키>"
   ```
5. 자동화 → "아침 업무 브리핑" 켜고 "지금 실행" → 알림 1건, 실행 이력 `성공`
6. (워커 배포 시) 브리핑 시각을 2~3분 뒤로 설정 → 그 시각에 실행 이력에 `예약` 실행이 생기는지
7. (Resend 설정 시) 브리핑 이메일 수신, 설정에서 수신 끄면 앱 내 알림만 오는지

## 비용 (확정 사항 #7, 월 상한 $50)

검증 단계는 Supabase Free + Vercel Hobby + Fly 최소 VM(약 $2~5)으로 충분하다.
운영 전환 시 Supabase Pro($25: 일일 백업 7일, 세션 설정)로 올린다.
