'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import {
  FINANCE_ACCOUNT_LABELS,
  FINANCE_KIND_LABELS,
  financeBudgetProgress,
  formatWon,
  shiftFinanceMonth,
} from '@myos/core';
import {
  archiveFinanceAccountAction,
  deleteFinanceBudgetAction,
  setFinanceEntryDeletedAction,
} from '@/server/actions/finance';
import { Button } from '../ui/button';
import { Dialog } from '../ui/dialog';
import { Input } from '../ui/field';
import { FormMessage } from '../ui/form-message';
import { AccountForm, BudgetForm, EntryForm } from './finance-forms';
import type { FinanceAccount, FinanceBudget, FinanceEntry, FinanceOverview } from './types';

export function FinanceView({
  overview: data,
  today,
}: {
  overview: FinanceOverview;
  today: string;
}) {
  const router = useRouter();
  const [accountEdit, setAccountEdit] = useState<FinanceAccount | 'new' | null>(null);
  const [entryEdit, setEntryEdit] = useState<FinanceEntry | 'new' | null>(null);
  const [budgetEdit, setBudgetEdit] = useState<FinanceBudget | 'new' | null>(null);
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();
  const name = (id: string | null) =>
    data.accounts.find((account) => account.id === id)?.name ?? '계좌 없음';
  const href = (month: string, page = 1, trash = data.trash) =>
    `/finance?month=${month}&page=${page}${trash ? '&view=trash' : ''}`;
  function run(operation: () => Promise<{ ok: boolean; error?: string }>) {
    setError(undefined);
    startTransition(async () => {
      const res = await operation();
      if (!res.ok) setError(res.error);
    });
  }
  return (
    <div className="space-y-6">
      <p className="text-sm text-muted">
        개인 전용 · KRW 원화 · 수동 기록. 은행 연결 없이 계좌와 거래를 직접 입력합니다.
      </p>
      <nav aria-label="재정 월 탐색" className="flex flex-wrap items-center gap-3 text-sm">
        {data.month > '1900-01' && (
          <Link href={href(shiftFinanceMonth(data.month, -1))}>← 이전 달</Link>
        )}
        <form action="/finance" method="get" className="flex items-center gap-2">
          <Input
            key={data.month}
            type="month"
            aria-label="조회 월"
            name="month"
            min="1900-01"
            max="2099-12"
            defaultValue={data.month}
            required
            className="!w-auto min-w-0"
          />
          <Button type="submit" variant="secondary">
            조회
          </Button>
        </form>
        {data.month < '2099-12' && (
          <Link href={href(shiftFinanceMonth(data.month, 1))}>다음 달 →</Link>
        )}
        <Link href={href(today.slice(0, 7))}>이번 달</Link>
      </nav>
      <section aria-label="재정 요약" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {(
          [
            ['현재 계좌 합산 잔액', data.balance],
            ['이번 조회 월 수입', data.income],
            ['이번 조회 월 지출', data.expense],
            ['이번 조회 월 순수입', data.net],
          ] as const
        ).map(([label, amount]) => (
          <div key={label} className="rounded-xl border border-border bg-surface p-4">
            <h2 className="text-xs text-muted">{label}</h2>
            <p className="mt-2 break-all text-lg font-semibold">{formatWon(amount)}</p>
          </div>
        ))}
      </section>
      <p className="text-xs text-muted">
        계좌 합산 잔액은 보관 계좌와 카드 부채를 포함한 현재 기록 기준입니다. 월 순수입은 수입 −
        지출이며 이체·기초 잔액을 제외합니다.
      </p>
      <FormMessage error={error} />
      <section aria-label="내 계좌" className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="font-semibold">내 계좌</h2>
          <Button variant="secondary" onClick={() => setAccountEdit('new')}>
            계좌 추가
          </Button>
        </div>
        {data.accounts.length === 0 && (
          <p className="rounded-xl border border-dashed border-border p-6 text-sm text-muted">
            계좌를 먼저 추가하면 거래를 기록할 수 있습니다.
          </p>
        )}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {data.accounts.map((account) => (
            <article
              key={account.id}
              aria-label={`${account.name} 계좌`}
              className="rounded-xl border border-border bg-surface p-4 space-y-2"
            >
              <h3 className="break-words font-medium">
                {account.name}
                {account.archivedAt && <span className="ml-2 text-xs text-muted">보관 중</span>}
              </h3>
              <p className="text-xs text-muted">{FINANCE_ACCOUNT_LABELS[account.kind]}</p>
              <p className="break-all font-semibold">{formatWon(account.balance)}</p>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="ghost"
                  onClick={() => setAccountEdit(account)}
                  aria-label={`${account.name} 계좌 수정`}
                >
                  수정
                </Button>
                <Button
                  variant="ghost"
                  disabled={pending}
                  onClick={() =>
                    run(() => archiveFinanceAccountAction(account.id, !account.archivedAt))
                  }
                  aria-label={`${account.name} ${account.archivedAt ? '사용 재개' : '보관'}`}
                >
                  {account.archivedAt ? '사용 재개' : '보관'}
                </Button>
              </div>
            </article>
          ))}
        </div>
      </section>
      <div className="grid gap-6 lg:grid-cols-2">
        <section
          aria-label="카테고리별 지출"
          className="rounded-xl border border-border bg-surface p-4 space-y-3"
        >
          <h2 className="font-semibold">{data.month} 카테고리별 지출</h2>
          {data.byCategory.length === 0 && (
            <p className="text-sm text-muted">이번 달 지출 기록이 없습니다.</p>
          )}
          {data.byCategory.map((row) => (
            <div key={row.category} className="space-y-1">
              <div className="flex flex-wrap justify-between gap-2 text-sm">
                <span className="break-words">{row.category}</span>
                <span>{formatWon(row.amount)}</span>
              </div>
              <div className="h-2 rounded bg-surface-muted">
                <div
                  className="h-full rounded bg-accent"
                  style={{ width: `${financeBudgetProgress(data.expense, row.amount).percent}%` }}
                />
              </div>
            </div>
          ))}
        </section>
        <section
          aria-label="월 예산"
          className="rounded-xl border border-border bg-surface p-4 space-y-3"
        >
          <div className="flex items-center justify-between gap-2">
            <h2 className="font-semibold">{data.month} 월 예산</h2>
            <Button variant="secondary" onClick={() => setBudgetEdit('new')}>
              예산 추가
            </Button>
          </div>
          {data.budgets.length === 0 && (
            <p className="text-sm text-muted">카테고리별 지출 한도를 설정해 보세요.</p>
          )}
          {data.budgets.map((budget) => (
            <article
              key={budget.id}
              aria-label={`${budget.category} 예산`}
              className="space-y-1 border-t border-border pt-3"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="break-words text-sm font-medium">{budget.category}</h3>
                <span className="text-xs text-muted">
                  {formatWon(budget.spent)} / {formatWon(budget.amount)}
                </span>
              </div>
              <div className="h-2 rounded bg-surface-muted">
                <div
                  className={`h-full rounded ${budget.exceeded ? 'bg-danger' : 'bg-accent'}`}
                  style={{ width: `${budget.percent}%` }}
                />
              </div>
              <p className={`text-xs ${budget.exceeded ? 'text-danger' : 'text-muted'}`}>
                {budget.exceeded
                  ? `${formatWon((-BigInt(budget.remaining)).toString())} 초과`
                  : `${formatWon(budget.remaining)} 남음`}
              </p>
              <div className="flex gap-2">
                <Button
                  variant="ghost"
                  onClick={() => setBudgetEdit(budget)}
                  aria-label={`${budget.category} 예산 수정`}
                >
                  수정
                </Button>
                <Button
                  variant="ghost"
                  disabled={pending}
                  onClick={() => {
                    if (window.confirm('이 예산을 삭제할까요?'))
                      run(() => deleteFinanceBudgetAction(budget.id));
                  }}
                  aria-label={`${budget.category} 예산 삭제`}
                >
                  삭제
                </Button>
              </div>
            </article>
          ))}
        </section>
      </div>
      <section aria-label="재정 거래" className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="font-semibold">
              {data.month} {data.trash ? '거래 휴지통' : '거래 내역'} ({data.total}건)
            </h2>
            <Link className="text-sm underline" href={href(data.month, 1, !data.trash)}>
              {data.trash ? '거래 내역 보기' : '휴지통 보기'}
            </Link>
          </div>
          <Button
            disabled={!data.accounts.some((a) => !a.archivedAt)}
            onClick={() => setEntryEdit('new')}
          >
            거래 추가
          </Button>
        </div>
        <div className="overflow-x-auto rounded-xl border border-border bg-surface">
          <table className="w-full min-w-[640px] text-sm">
            <caption className="sr-only">
              {data.month} {data.trash ? '삭제된 거래' : '거래 목록'}
            </caption>
            <thead>
              <tr className="border-b border-border text-left">
                <th className="p-3">거래일</th>
                <th>종류</th>
                <th>계좌·카테고리·메모</th>
                <th className="text-right">금액</th>
                <th className="p-3">관리</th>
              </tr>
            </thead>
            <tbody>
              {data.entries.map((entry) => (
                <tr key={entry.id} className="border-b border-border">
                  <td className="p-3 whitespace-nowrap">{entry.occurredOn}</td>
                  <td>{FINANCE_KIND_LABELS[entry.kind]}</td>
                  <td className="max-w-xs py-3 break-words">
                    <p>
                      {name(entry.accountId)}
                      {entry.kind === 'transfer' && ` → ${name(entry.targetAccountId)}`}
                    </p>
                    <p className="text-xs text-muted">{entry.category}</p>
                    {entry.note && <p className="text-xs whitespace-pre-wrap">{entry.note}</p>}
                  </td>
                  <td className="text-right whitespace-nowrap">{formatWon(entry.amount)}</td>
                  <td className="p-3">
                    <div className="flex gap-1">
                      {data.trash ? (
                        <Button
                          variant="secondary"
                          disabled={pending}
                          onClick={() => run(() => setFinanceEntryDeletedAction(entry.id, false))}
                          aria-label={`${entry.note || entry.category} 거래 복원`}
                        >
                          복원
                        </Button>
                      ) : (
                        <>
                          <Button
                            variant="ghost"
                            onClick={() => setEntryEdit(entry)}
                            aria-label={`${entry.note || entry.category} 거래 수정`}
                          >
                            수정
                          </Button>
                          <Button
                            variant="ghost"
                            disabled={pending}
                            onClick={() => {
                              if (
                                window.confirm(
                                  '이 거래를 삭제할까요? 휴지통에서 복원할 수 있습니다.',
                                )
                              )
                                run(() => setFinanceEntryDeletedAction(entry.id, true));
                            }}
                            aria-label={`${entry.note || entry.category} 거래 삭제`}
                          >
                            삭제
                          </Button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {data.entries.length === 0 && (
                <tr>
                  <td colSpan={5} className="p-8 text-center text-muted">
                    {data.trash
                      ? '이 달의 휴지통이 비어 있습니다.'
                      : '이 달에 기록한 거래가 없습니다.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <nav aria-label="거래 페이지" className="flex items-center gap-3 text-sm">
          {data.page > 1 && <Link href={href(data.month, data.page - 1)}>이전 페이지</Link>}
          <span>
            {data.page} / {data.pages} 페이지 · 50건씩 표시
          </span>
          {data.page < data.pages && (
            <Link href={href(data.month, data.page + 1)}>다음 페이지</Link>
          )}
        </nav>
      </section>
      <Dialog
        open={accountEdit !== null}
        onClose={() => setAccountEdit(null)}
        title={accountEdit === 'new' ? '계좌 추가' : '계좌 수정'}
      >
        {accountEdit && (
          <AccountForm
            account={accountEdit === 'new' ? undefined : accountEdit}
            onDone={() => setAccountEdit(null)}
          />
        )}
      </Dialog>
      <Dialog
        open={entryEdit !== null}
        onClose={() => setEntryEdit(null)}
        title={entryEdit === 'new' ? '거래 추가' : '거래 수정'}
      >
        {entryEdit && (
          <EntryForm
            entry={entryEdit === 'new' ? undefined : entryEdit}
            accounts={data.accounts}
            today={today}
            month={data.month}
            onDone={(month) => {
              setEntryEdit(null);
              router.push(href(month, 1, false));
            }}
          />
        )}
      </Dialog>
      <Dialog
        open={budgetEdit !== null}
        onClose={() => setBudgetEdit(null)}
        title={budgetEdit === 'new' ? '예산 추가' : '예산 수정'}
      >
        {budgetEdit && (
          <BudgetForm
            budget={budgetEdit === 'new' ? undefined : budgetEdit}
            month={data.month}
            onDone={(month) => {
              setBudgetEdit(null);
              router.push(href(month));
            }}
          />
        )}
      </Dialog>
    </div>
  );
}
