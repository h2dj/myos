# MyOS 개발계획 (초안 v0.1)

근거: 「MyOS 개인 통합 관리 시스템 상세기획서 v0.2」, 와이어프레임 10종(로그인 ~ 설정), Mindy 케이스 ISS-0522.
상태: 착수 전 확정 필요 항목(§7)에 대한 결정을 받은 뒤 Phase 0 시작.

## 1. 범위 정리 — 기획서 vs 와이어프레임

| 영역 | 기획서 | 와이어프레임 | 계획 반영 |
|---|---|---|---|
| 통합 인박스 | 필수(P0, INBOX-01) | 전용 화면 없음, 대시보드 "메모/빠른 기록" 위젯만 | 빠른 기록 위젯 + 사이드바 `인박스` 화면 신규 설계 |
| 재정 관리 | 2차(v1.1) | 메뉴·화면·대시보드 KPI(이번 달 지출) 존재 | MVP는 메뉴 숨김/“준비 중”, KPI 위젯 제외 |
| 노트 / 자원 메뉴 | 지식·아이디어 1개 화면 | 지식/아이디어 + 노트 + 자원 별도 메뉴 | 지식 화면의 탭(노트·아이디어·자료·즐겨찾기)으로 통합 → 메뉴 정리 |
| 할 일 보기 | 목록·필터 | 목록/보드/캘린더/아이젠하워 | MVP: 목록+보드, 캘린더·아이젠하워는 후속 |
| 캘린더 | Google Calendar 읽기 | 월/주/일 + 일정 추가 | 내부 일정(쓰기) + 외부 일정(읽기전용 오버레이) 분리 |
| 자동화 | A01~A06 템플릿 | 키워드 자동 태그, 지출 자동 분류, 주간 리포트 이메일 | A01~A06 우선, 화면 예시는 템플릿 카탈로그 후속 항목으로 |
| 공유 | 프로젝트·공간 단위, 재정 공유 제외 | 페이지 단위 공유, "가계부" 공유 예시 | 공간/프로젝트 단위로 구현, 재정 공유 불가 원칙 유지 |
| 로그인 | 인증 방식 미정 | 이메일 / Google / Apple | 이메일+Google 우선, Apple은 P1 |
| 대시보드 KPI | KPI 숫자 위젯 | 집중 시간 12.5h, 읽고 있는 문서 3개 | 집중 시간·읽는 문서는 데이터 원천이 없어 정의 필요(§7) |
| 설정 | 언급 적음 | 프로필·알림·연동·보안·데이터 관리·플랜/결제 | 플랜/결제 제외, 나머지 MVP |

## 2. 기술 스택 / 아키텍처

- 모듈형 모놀리스 + 백그라운드 Worker 분리 (기획서 §8 준수)
- pnpm 모노레포
  - `apps/web` — Next.js(App Router) + React + TypeScript + Tailwind + shadcn/ui, PWA(serwist)
  - `apps/worker` — 스케줄러/작업 큐(pg-boss: Postgres 기반, 별도 Redis 불필요)
  - `packages/db` — Drizzle ORM 스키마·마이그레이션·시드
  - `packages/core` — 도메인 로직(권한, 반복 규칙, 자동화 엔진, 위젯 데이터 쿼리)
- DB/인증: Supabase(Postgres + Auth). 권한은 서버 측 검사 + RLS 이중화
- 배포: web → Vercel, worker → Fly.io/Railway(상시 프로세스), DB → Supabase
- 테스트: Vitest(단위/도메인), Playwright(E2E·인수 테스트), 테스트용 Postgres(docker)
- CI: GitHub Actions — lint, typecheck, test, 마이그레이션 검증

## 3. 데이터 모델 보완 (기획서 §4 기준)

- `tasks`: `workspace_id` 추가(프로젝트 없는 개인 할 일), `deleted_at`, `completed_at`, `sort_order`
- 반복: `task_series`(rrule, timezone, next_run_at) + `tasks.series_id`, `occurrence_date`
  → `UNIQUE(series_id, occurrence_date)`로 **TASK-02 중복 방지를 DB에서 보장**
- `automation_runs`: `idempotency_key UNIQUE(automation_id, key)`, `attempt`, `error`, `input_summary`
- 연동: `integrations.token_encrypted`(앱 레벨 암호화), `external_refs(provider, external_id, entity_id) UNIQUE`
  → INT-01 노션 가져오기 중복 방지
- `tags`, `entity_tags`, `entity_links(source_type, source_id, target_type, target_id, link_type)`
- `dashboards(user_id, preset)`, `dashboard_widgets(type, data_source, filters, display_config, position, size, refresh_policy, access_scope)`
- 공통: UUID PK, `created_at/updated_at`, 복구 대상 `deleted_at`, `audit_logs`

## 4. 단계별 일정 (1인 개발 기준 추정, 약 13~14주)

| 단계 | 기간 | 산출물 | 요구사항 ID |
|---|---|---|---|
| 0 셋업 | 1주 | 모노레포, CI, Supabase 프로젝트, 디자인 토큰/레이아웃 셸(사이드바·헤더), DB 마이그레이션 파이프라인 | — |
| 1 기반 | 3주 | 로그인·세션 만료, 개인 공간 자동 생성, 권한 미들웨어, 할 일 CRUD+복구, 프로젝트, 메모·태그·링크, 인박스, 앱 내 알림 | AUTH-01, WS-01, TASK-01, PROJ-01, NOTE-01, INBOX-01, NOTI-01 |
| 2 대시보드 | 2주 | 위젯 8종, 오늘/이번 주/전체 프리셋, 위젯 추가·삭제·숨김·정렬 저장, 기간·영역 필터, 빠른 입력, 낙관적 업데이트 | DASH-01~03 |
| 3 자동화 | 2.5주 | Worker·스케줄러, 템플릿 A01~A06, 반복 할 일 생성, 실행 로그·재시도·중복 방지, 실행 시점 권한 재검사, 자동화 센터 화면 | TASK-02, AUTO-01~02 |
| 4 연동·공유 | 3주 | 노션 가져오기(조사→매핑→샘플→전체→검증), Google Calendar 읽기, 공유 공간 초대·조회자/편집자 권한, 검색 | INT-01~02, SHARE-01, SEARCH-01 |
| 5 검증 | 1.5주 | 데이터 내보내기/복원 검증, 성능 측정(p95), 보안 점검, 모바일 PWA·키보드 접근성, 인수 테스트 7종 자동화 | DATA-01, §9.1 |

화면 구현 순서: 레이아웃 셸 → 할 일(3) → 프로젝트(7) → 지식(5) → 대시보드(2) → 캘린더(4) → 자동화(8) → 공유(9) → 설정(10) → 로그인 디자인 마감(1). 재정(6)은 v1.1.

## 5. 인수 테스트 매핑 (Playwright + 통합 테스트)

1. 재접속 후 위젯 구성 유지 — 2단계 종료 시 자동화
2. 할 일 상태 변경 → 대시보드 수치 갱신 — 2단계
3. 반복 할 일 중복 생성 방지 — 3단계(Worker 동시 실행 2회 테스트)
4. 자동화 실패 로그·재시도 — 3단계(실패 주입)
5. 노션 가져오기 중복 방지 — 4단계(동일 데이터 2회 가져오기)
6. 공유 사용자의 개인 데이터 접근 차단 — 1단계부터 API 권한 테스트, 4단계 확장
7. 백업 테스트 복원 성공 — 5단계

## 6. 리스크

- 와이어프레임이 기획서보다 범위가 넓음(재정·보드뷰·이메일 리포트 등) → 범위 확정 없이는 일정 초과
- 노션 데이터 구조 미확인 → 4단계 일정 변동 폭 큼
- Worker 호스팅/알림 채널(이메일·푸시) 미정 → 3단계 설계 영향
- 성능 목표는 실제 데이터량 확정 후 재측정

## 7. 착수 전 확정 필요

1. 인증 방식(이메일 매직링크 vs 비밀번호, Apple 로그인 MVP 포함 여부)
2. 클라우드 공급자(Supabase + Vercel 제안 승인 여부)
3. 알림 채널(MVP 앱 내 알림만 vs 이메일/웹푸시 포함)
4. 재정 메뉴 MVP 노출 여부, 대시보드 KPI 4종의 정의(집중 시간·읽는 문서 데이터 원천)
5. 인박스 전용 화면 추가 동의
6. 실제 노션 DB 구조(샘플 export), 협업 사용자 규모
7. 데이터 보존 기간, 백업 주기, 월 비용 상한
