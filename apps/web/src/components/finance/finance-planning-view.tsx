'use client';
import Link from 'next/link';
import { useState, useTransition } from 'react';
import {
  addFinanceMonths,
  FINANCE_FORECAST_PERIODS,
  FINANCE_FREQUENCIES,
  FINANCE_KIND_LABELS,
  formatWon,
  type FinanceForecastPeriod,
} from '@myos/core';
import type { getFinanceForecast, listFinancePlans } from '@myos/domain';
import { pauseFinancePlanAction, skipFinancePlanAction } from '@/server/actions/finance-planning';
import {
  FinancePlanForm,
  FinancePlanPostingForm,
  type FinancePlanRow,
  type PlanPosting,
} from './finance-plan-form';
import type { FinanceAccount } from './types';
import { Button } from '../ui/button';
import { Dialog } from '../ui/dialog';
import { Field, Input, Select } from '../ui/field';
import { FormMessage } from '../ui/form-message';
type Forecast = Awaited<ReturnType<typeof getFinanceForecast>>;
type PlansPage = Awaited<ReturnType<typeof listFinancePlans>>;
export function FinancePlanningView({
  forecast,
  error: initialError,
  plans,
  accounts,
  today,
}: {
  forecast: Forecast | null;
  error?: string;
  plans: PlansPage;
  accounts: FinanceAccount[];
  today: string;
}) {
  const [editing, setEditing] = useState<{
    plan?: FinancePlanRow;
    kind: 'expense' | 'income';
    recurring: boolean;
  }>();
  const [posting, setPosting] = useState<PlanPosting>();
  const [error, setError] = useState<string>();
  const [notice, setNotice] = useState<string>();
  const [pending, startTransition] = useTransition();
  const name = (id: string | null) => accounts.find((a) => a.id === id)?.name ?? '계좌 없음';
  function run(fn: () => Promise<{ ok: boolean; error?: string }>) {
    setError(undefined);
    setNotice(undefined);
    startTransition(async () => {
      const result = await fn();
      if (!result.ok) setError(result.error);
    });
  }
  const href = (page = forecast?.page ?? 1, plansPage = plans.page) =>
    `/finance/planning?${new URLSearchParams({ period: forecast?.period ?? 'monthEnd', until: forecast?.until ?? today, page: String(page), plansPage: String(plansPage) })}`;
  return (
    <div className="space-y-6">
      <p className="text-sm text-muted">
        개인 전용 · 원화 · 예정만으로는 실제 거래를 자동 생성하지 않습니다. 직접 입력한 거래는 자동
        연결되지 않으므로 해당 예정 회차를 제외해 주세요.
      </p>
      <ForecastControls
        key={`${forecast?.period}:${forecast?.until}`}
        today={today}
        forecast={forecast}
      />
      <FormMessage error={error ?? initialError} />
      {notice && (
        <p role="status" className="text-sm text-success">
          {notice}
        </p>
      )}
      {forecast && (
        <section aria-label="수지 예측 결과" className="space-y-4">
          <h2 className="font-semibold">
            {today} ~ {forecast.until} 예상 수지
          </h2>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {(
              [
                ['현재 계좌 합산 잔액', forecast.summary.opening],
                ['예정 수입', forecast.summary.income],
                ['예정 지출', forecast.summary.expense],
                ['기준일 예상 잔액', forecast.summary.closing],
              ] as const
            ).map(([label, value]) => (
              <div key={label} className="rounded-xl border border-border bg-surface p-3">
                <h3 className="text-xs text-muted">{label}</h3>
                <p className="mt-2 break-all text-lg font-semibold">{formatWon(value)}</p>
              </div>
            ))}
          </div>
          <p className="text-sm">
            예정 순수지 {formatWon(forecast.summary.net)} · 일별 마감 최저 예상 잔액{' '}
            {formatWon(forecast.summary.minimum)}
            {forecast.summary.negativeOn &&
              ` · 합산 잔액이 음수인 첫 날짜 ${forecast.summary.negativeOn}`}
          </p>
          <ForecastChart forecast={forecast} />
          <p className="text-xs text-muted">
            현재 잔액 + 오늘부터 기준일까지의 미확정 예정 순수지입니다. 실제 거래·제외 회차는 중복
            반영하지 않습니다. 이체는 계좌별 잔액에만 반영하고 합산 수입·지출에서 제외합니다. 카드
            부채·보관 계좌도 합산합니다. 미등록 변동 지출과 하루 중 지급 순서는 계산하지 않습니다.
          </p>
          <div className="overflow-x-auto rounded-xl border border-border bg-surface">
            <table className="w-full min-w-[520px] text-sm">
              <caption className="sr-only">계좌별 예상 잔액</caption>
              <thead>
                <tr className="border-b border-border text-left">
                  <th className="p-3">계좌</th>
                  <th>현재</th>
                  <th>예정 증감</th>
                  <th>예상 잔액</th>
                </tr>
              </thead>
              <tbody>
                {forecast.summary.accounts.map((a) => (
                  <tr key={a.id} className="border-b border-border">
                    <th className="p-3 text-left font-medium">{a.name}</th>
                    <td>{formatWon(a.balance)}</td>
                    <td>{formatWon(a.change)}</td>
                    <td className="font-semibold">{formatWon(a.projected)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <h3 className="font-semibold">
            계산 근거 · 미확정 {forecast.pendingCount}건 / 전체 {forecast.total}회차
          </h3>
          <div className="overflow-x-auto rounded-xl border border-border bg-surface">
            <table className="w-full min-w-[700px] text-sm">
              <caption className="sr-only">예정 회차와 예측 반영 상태</caption>
              <thead>
                <tr className="border-b border-border text-left">
                  <th className="p-3">예정일</th>
                  <th>이름·계좌</th>
                  <th>종류·금액</th>
                  <th>상태</th>
                  <th>처리</th>
                </tr>
              </thead>
              <tbody>
                {forecast.flows.map((flow) => {
                  const blocked =
                    !flow.restoring &&
                    [flow.accountId, flow.targetAccountId]
                      .filter(Boolean)
                      .some((id) => accounts.find((a) => a.id === id)?.archivedAt);
                  return (
                    <tr key={flow.id} className="border-b border-border">
                      <td className="p-3 whitespace-nowrap">{flow.dueOn}</td>
                      <td className="max-w-xs break-words py-3">
                        <p>{flow.title}</p>
                        <p className="text-xs text-muted">
                          {name(flow.accountId)}
                          {flow.targetAccountId && ` → ${name(flow.targetAccountId)}`}
                        </p>
                        {blocked && (
                          <p className="text-xs text-danger">
                            확정 전 보관 계좌를 변경·재개하세요.
                          </p>
                        )}
                      </td>
                      <td>
                        {FINANCE_KIND_LABELS[flow.kind]}
                        <br />
                        {formatWon(flow.amount)}
                      </td>
                      <td>
                        {flow.status === 'posted'
                          ? '확정됨 · 예정 제외'
                          : flow.status === 'skipped'
                            ? '회차 제외'
                            : flow.restoring
                              ? '기존 거래 복원 대기'
                              : '예정 반영'}
                      </td>
                      <td>
                        <div className="flex flex-wrap gap-2 py-2">
                          {flow.status === 'pending' ? (
                            <>
                              <Button
                                variant="secondary"
                                disabled={pending || blocked}
                                aria-label={`${flow.title} ${flow.dueOn} ${flow.restoring ? '복원' : '확정'}`}
                                onClick={() =>
                                  setPosting({
                                    planId: flow.planId,
                                    title: flow.title,
                                    on: flow.dueOn,
                                    amount: flow.amount,
                                    actualOn: flow.actualOn,
                                    restoring: flow.restoring,
                                  })
                                }
                              >
                                {flow.restoring ? '기존 거래 복원' : '거래 확정'}
                              </Button>
                              <Button
                                variant="ghost"
                                disabled={pending}
                                aria-label={`${flow.title} ${flow.dueOn} 제외`}
                                onClick={() =>
                                  run(() => skipFinancePlanAction(flow.planId, flow.dueOn, true))
                                }
                              >
                                이번 회차 제외
                              </Button>
                            </>
                          ) : flow.status === 'skipped' ? (
                            <Button
                              variant="ghost"
                              disabled={pending}
                              aria-label={`${flow.title} ${flow.dueOn} 제외 취소`}
                              onClick={() =>
                                run(() => skipFinancePlanAction(flow.planId, flow.dueOn, false))
                              }
                            >
                              제외 취소
                            </Button>
                          ) : (
                            <Link
                              href={`/finance?month=${flow.actualOn?.slice(0, 7) ?? today.slice(0, 7)}`}
                              className="text-accent"
                            >
                              실제 거래 보기
                            </Link>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {forecast.total === 0 && (
                  <tr>
                    <td colSpan={5} className="p-6 text-center text-muted">
                      이 기간에 예정된 회차가 없습니다.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <nav aria-label="예정 회차 페이지" className="flex flex-wrap gap-3 text-sm">
            {forecast.page > 1 && <Link href={href(forecast.page - 1)}>이전 회차 페이지</Link>}
            <span>
              {forecast.page} / {forecast.pages} 페이지 · 합계는 전체 회차 기준
            </span>
            {forecast.page < forecast.pages && (
              <Link href={href(forecast.page + 1)}>다음 회차 페이지</Link>
            )}
          </nav>
        </section>
      )}
      <section aria-label="고정·예정 규칙" className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-semibold">고정 지출·예정 규칙 ({plans.total}개)</h2>
          <div className="flex flex-wrap gap-2">
            <Button
              disabled={!accounts.some((a) => !a.archivedAt)}
              onClick={() => setEditing({ kind: 'expense', recurring: true })}
            >
              고정 지출 추가
            </Button>
            <Button
              variant="secondary"
              disabled={!accounts.some((a) => !a.archivedAt)}
              onClick={() => setEditing({ kind: 'income', recurring: false })}
            >
              예정 수입·지출 추가
            </Button>
          </div>
        </div>
        {accounts.length === 0 && (
          <p className="text-sm text-muted">
            <Link href="/finance" className="text-accent">
              재정 관리에서 계좌를 먼저 추가하세요.
            </Link>
          </p>
        )}
        <p className="text-xs text-muted">
          지난 예정일은 미래 예측에서 제외합니다. 과거 한 번 예정은 아래 거래 확정으로 처리할 수
          있고, 반복 규칙은 오늘 이후 회차만 계산합니다. 이력이 생긴 규칙의 최초 날짜·주기는
          보존하고 변경할 때는 중지 후 새 규칙을 등록하세요.
        </p>
        <div className="grid gap-3 lg:grid-cols-2">
          {plans.plans.map((plan) => (
            <article
              key={plan.id}
              aria-label={`${plan.title} 예정 규칙`}
              className="rounded-xl border border-border bg-surface p-4 space-y-2"
            >
              <h3 className="break-words font-medium">
                {plan.title}
                {plan.pausedAt && <span className="ml-2 text-xs text-muted">중지 중</span>}
              </h3>
              <p className="text-sm">
                {FINANCE_KIND_LABELS[plan.kind]} · {formatWon(plan.amount)} ·{' '}
                {FINANCE_FREQUENCIES[plan.frequency]}
              </p>
              <p className="text-xs text-muted">
                {name(plan.accountId)}
                {plan.targetAccountId && ` → ${name(plan.targetAccountId)}`} · {plan.category} · 첫
                예정일 {plan.startOn}
                {plan.endOn && ` · 종료 ${plan.endOn}`} · 다음 회차{' '}
                {plan.nextOn ?? '없음 (과거·종료)'} · 처리 이력 {plan.processedCount}회
              </p>
              {plan.note && (
                <p className="whitespace-pre-wrap break-words text-sm text-muted">{plan.note}</p>
              )}
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="ghost"
                  aria-label={`${plan.title} 규칙 수정`}
                  onClick={() =>
                    setEditing({
                      plan,
                      kind: plan.kind === 'income' ? 'income' : 'expense',
                      recurring: plan.frequency !== 'once',
                    })
                  }
                >
                  수정
                </Button>
                <Button
                  variant="ghost"
                  disabled={pending}
                  aria-label={`${plan.title} ${plan.pausedAt ? '다시 사용' : '중지'}`}
                  onClick={() => run(() => pauseFinancePlanAction(plan.id, !plan.pausedAt))}
                >
                  {plan.pausedAt ? '다시 사용' : '중지'}
                </Button>
                <Button
                  variant="secondary"
                  disabled={pending || !!plan.pausedAt}
                  aria-label={`${plan.title} 회차 거래 확정`}
                  onClick={() =>
                    setPosting({
                      planId: plan.id,
                      title: plan.title,
                      on: plan.nextOn ?? plan.startOn,
                      amount: plan.amount,
                      chooseOccurrence: plan.frequency !== 'once',
                    })
                  }
                >
                  회차 거래 확정
                </Button>
              </div>
            </article>
          ))}
        </div>
        {plans.total === 0 && (
          <p className="rounded-xl border border-dashed border-border p-5 text-sm text-muted">
            고정 지출과 예정 수입·지출을 등록해 보세요.
          </p>
        )}
        <nav aria-label="예정 규칙 페이지" className="flex gap-3 text-sm">
          {plans.page > 1 && <Link href={href(undefined, plans.page - 1)}>이전 규칙 페이지</Link>}
          <span>
            {plans.page} / {plans.pages} 페이지
          </span>
          {plans.page < plans.pages && (
            <Link href={href(undefined, plans.page + 1)}>다음 규칙 페이지</Link>
          )}
        </nav>
      </section>
      <Dialog
        open={!!editing}
        onClose={() => setEditing(undefined)}
        title={
          editing?.plan
            ? '예정 규칙 수정'
            : editing?.recurring
              ? '고정 지출 추가'
              : '예정 수입·지출 추가'
        }
      >
        {editing && (
          <FinancePlanForm
            plan={editing.plan}
            kind={editing.kind}
            recurring={editing.recurring}
            accounts={accounts}
            today={today}
            onDone={() => {
              setEditing(undefined);
              setNotice('예정을 저장했습니다.');
            }}
          />
        )}
      </Dialog>
      <Dialog
        open={!!posting}
        onClose={() => setPosting(undefined)}
        title={posting?.restoring ? '기존 거래 복원' : '예정 거래 확정'}
      >
        {posting && (
          <FinancePlanPostingForm
            posting={posting}
            today={today}
            onDone={() => {
              setPosting(undefined);
              setNotice('실제 거래에 반영했습니다. 해당 회차는 예정 합계에서 제외됩니다.');
            }}
          />
        )}
      </Dialog>
    </div>
  );
}
function ForecastControls({ forecast, today }: { forecast: Forecast | null; today: string }) {
  const [period, setPeriod] = useState<FinanceForecastPeriod>(forecast?.period ?? 'monthEnd');
  const max =
    addFinanceMonths(today, 120) < '2099-12-31' ? addFinanceMonths(today, 120) : '2099-12-31';
  return (
    <form
      action="/finance/planning"
      method="get"
      className="flex flex-wrap items-end gap-3 rounded-xl border border-border bg-surface p-4"
    >
      <Field label="예측 기간 옵션">
        <Select
          name="period"
          value={period}
          onChange={(e) => setPeriod(e.target.value as FinanceForecastPeriod)}
        >
          {Object.entries(FINANCE_FORECAST_PERIODS).map(([key, label]) => (
            <option key={key} value={key}>
              {label}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="예측 기준 날짜">
        <Input
          type="date"
          name="until"
          min={today}
          max={max}
          required
          disabled={period !== 'custom'}
          defaultValue={forecast?.until ?? today}
        />
      </Field>
      <Button type="submit">수지 예측 조회</Button>
    </form>
  );
}
function ForecastChart({ forecast }: { forecast: Forecast }) {
  const points = [
    { day: forecast.today, balance: forecast.summary.opening },
    ...forecast.summary.timeline,
    { day: forecast.until, balance: forecast.summary.closing },
  ];
  const values = points.map((p) => BigInt(p.balance));
  const low = values.reduce((a, b) => (a < b ? a : b)),
    high = values.reduce((a, b) => (a > b ? a : b));
  const range = high - low || 1n;
  const span = Math.max(1, Date.parse(forecast.until) - Date.parse(forecast.today));
  const coordinates = points
    .map(
      (p) =>
        `${90 + ((Date.parse(p.day) - Date.parse(forecast.today)) / span) * 430},${155 - Number(((BigInt(p.balance) - low) * 115n) / range)}`,
    )
    .join(' ');
  return (
    <figure className="rounded-xl border border-border bg-surface p-3">
      <svg
        viewBox="0 0 600 200"
        className="w-full"
        role="img"
        aria-label="등록된 예정에 따른 일별 마감 예상 잔액 추이"
      >
        <line x1={90} x2={520} y1={155} y2={155} stroke="currentColor" opacity={0.2} />
        <polyline fill="none" points={coordinates} stroke="#6366f1" strokeWidth={3} />
        <text x={5} y={40} fontSize={10} fill="currentColor">
          {formatWon(high.toString())}
        </text>
        <text x={5} y={155} fontSize={10} fill="currentColor">
          {formatWon(low.toString())}
        </text>
        <text x={90} y={180} fontSize={11} fill="currentColor">
          {forecast.today}
        </text>
        <text x={520} y={180} textAnchor="end" fontSize={11} fill="currentColor">
          {forecast.until}
        </text>
      </svg>
      <figcaption className="text-xs text-muted">
        등록한 예정에 따른 단순 추정입니다. 실제 수입·지출과 다를 수 있습니다.
      </figcaption>
    </figure>
  );
}
