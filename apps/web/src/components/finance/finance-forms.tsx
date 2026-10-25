'use client';

import { useId, useRef, useState, useTransition } from 'react';
import { FINANCE_ACCOUNT_LABELS, FINANCE_CATEGORIES, FINANCE_KIND_LABELS } from '@myos/core';
import {
  saveFinanceAccountAction,
  saveFinanceBudgetAction,
  saveFinanceEntryAction,
} from '@/server/actions/finance';
import { Button } from '../ui/button';
import { Field, Input, Select, Textarea } from '../ui/field';
import { FormMessage } from '../ui/form-message';
import type { FinanceAccount, FinanceBudget, FinanceEntry } from './types';

const value = (form: FormData, key: string) => String(form.get(key) ?? '');
const amountProps = {
  type: 'text',
  inputMode: 'numeric',
  pattern: '[0-9]{1,15}',
  maxLength: 15,
} as const;

export function AccountForm({ account, onDone }: { account?: FinanceAccount; onDone: () => void }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string>();
  return (
    <form
      action={(form) =>
        startTransition(async () => {
          setError(undefined);
          const res = await saveFinanceAccountAction(
            {
              name: value(form, 'name'),
              kind: value(form, 'kind'),
              openingBalance: value(form, 'openingBalance'),
            },
            account?.id,
          );
          if (!res.ok) return setError(res.error);
          onDone();
        })
      }
      className="space-y-4"
    >
      <Field label="계좌 이름">
        <Input
          name="name"
          autoFocus
          required
          maxLength={100}
          defaultValue={account?.name}
          placeholder="생활비 통장"
        />
      </Field>
      <Field label="계좌 종류">
        <Select name="kind" defaultValue={account?.kind ?? 'bank'}>
          {Object.entries(FINANCE_ACCOUNT_LABELS).map(([key, label]) => (
            <option key={key} value={key}>
              {label}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="기초 잔액 (원)">
        <Input
          name="openingBalance"
          required
          type="text"
          inputMode="text"
          pattern="-?[0-9]{1,15}"
          maxLength={16}
          defaultValue={account?.openingBalance ?? '0'}
        />
      </Field>
      <p className="text-xs text-muted">
        기록을 시작하기 직전의 잔액입니다. 카드 미결제액은 음수로 입력하세요. 수정하면 현재 잔액에도
        반영됩니다.
      </p>
      <FormMessage error={error} />
      <Button type="submit" disabled={pending}>
        {pending ? '저장 중…' : '계좌 저장'}
      </Button>
    </form>
  );
}

export function EntryForm({
  entry,
  accounts,
  today,
  month,
  onDone,
}: {
  entry?: FinanceEntry;
  accounts: FinanceAccount[];
  today: string;
  month: string;
  onDone: (month: string) => void;
}) {
  const [kind, setKind] = useState<FinanceEntry['kind']>(entry?.kind ?? 'expense');
  const options = accounts.filter(
    (a) => !a.archivedAt || a.id === entry?.accountId || a.id === entry?.targetAccountId,
  );
  const [accountId, setAccountId] = useState(entry?.accountId ?? options[0]?.id ?? '');
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string>();
  const requestId = useRef<string | null>(null);
  const listId = useId();
  return (
    <form
      action={(form) =>
        startTransition(async () => {
          setError(undefined);
          requestId.current ??= crypto.randomUUID();
          const res = await saveFinanceEntryAction(
            {
              kind,
              accountId,
              targetAccountId: kind === 'transfer' ? value(form, 'targetAccountId') || null : null,
              occurredOn: value(form, 'occurredOn'),
              amount: value(form, 'amount'),
              category: value(form, 'category'),
              note: value(form, 'note'),
            },
            entry?.id ?? requestId.current,
            !!entry,
          );
          if (!res.ok) return setError(res.error);
          onDone(res.data.occurredOn.slice(0, 7));
        })
      }
      className="space-y-4"
    >
      <fieldset disabled={pending} className="space-y-4">
        <Field label="거래 종류">
          <Select value={kind} onChange={(e) => setKind(e.target.value as FinanceEntry['kind'])}>
            {Object.entries(FINANCE_KIND_LABELS).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </Select>
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="거래일">
            <Input
              type="date"
              name="occurredOn"
              required
              min="1900-01-01"
              max={today}
              defaultValue={
                entry?.occurredOn ?? (month < today.slice(0, 7) ? `${month}-01` : today)
              }
            />
          </Field>
          <Field label="금액 (원)">
            <Input
              {...amountProps}
              name="amount"
              required
              autoFocus
              defaultValue={entry?.amount}
              placeholder="15000"
            />
          </Field>
        </div>
        <Field label={kind === 'transfer' ? '출발 계좌' : '거래 계좌'}>
          <Select value={accountId} onChange={(e) => setAccountId(e.target.value)} required>
            <option value="">선택</option>
            {options.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
                {a.archivedAt ? ' (보관)' : ''}
              </option>
            ))}
          </Select>
        </Field>
        {kind === 'transfer' ? (
          <Field label="도착 계좌">
            <Select name="targetAccountId" required defaultValue={entry?.targetAccountId ?? ''}>
              <option value="">선택</option>
              {options
                .filter((a) => a.id !== accountId)
                .map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                    {a.archivedAt ? ' (보관)' : ''}
                  </option>
                ))}
            </Select>
          </Field>
        ) : (
          <Field label="카테고리">
            <Input
              name="category"
              maxLength={50}
              list={listId}
              defaultValue={entry?.kind === 'transfer' ? '' : (entry?.category ?? '')}
              placeholder="미분류"
            />
          </Field>
        )}
        <datalist id={listId}>
          {FINANCE_CATEGORIES.map((category) => (
            <option key={category} value={category} />
          ))}
        </datalist>
        <Field label="거래 메모">
          <Textarea name="note" rows={2} maxLength={1000} defaultValue={entry?.note} />
        </Field>
        <FormMessage error={error} />
        <Button type="submit" disabled={pending}>
          {pending ? '저장 중…' : '거래 저장'}
        </Button>
      </fieldset>
    </form>
  );
}

export function BudgetForm({
  budget,
  month,
  onDone,
}: {
  budget?: FinanceBudget;
  month: string;
  onDone: (month: string) => void;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string>();
  const listId = useId();
  return (
    <form
      action={(form) =>
        startTransition(async () => {
          setError(undefined);
          const res = await saveFinanceBudgetAction({
            month: value(form, 'month'),
            category: value(form, 'category'),
            amount: value(form, 'amount'),
          });
          if (!res.ok) return setError(res.error);
          onDone(res.data.month.slice(0, 7));
        })
      }
      className="space-y-4"
    >
      <Field label="예산 월">
        <Input
          name="month"
          type="month"
          min="1900-01"
          max="2099-12"
          required
          readOnly={!!budget}
          defaultValue={budget?.month.slice(0, 7) ?? month}
        />
      </Field>
      <Field label="예산 카테고리">
        <Input
          name="category"
          list={listId}
          required
          readOnly={!!budget}
          maxLength={50}
          defaultValue={budget?.category}
          placeholder="식비"
        />
      </Field>
      <datalist id={listId}>
        {FINANCE_CATEGORIES.map((category) => (
          <option key={category} value={category} />
        ))}
      </datalist>
      <Field label="예산 금액 (원)">
        <Input {...amountProps} name="amount" required defaultValue={budget?.amount} />
      </Field>
      <p className="text-xs text-muted">
        지출 카테고리 이름과 정확히 일치해야 합니다. 같은 월·카테고리를 저장하면 기존 예산을
        수정합니다. 0원 예산도 설정할 수 있습니다.
      </p>
      <FormMessage error={error} />
      <Button type="submit" disabled={pending}>
        {pending ? '저장 중…' : '예산 저장'}
      </Button>
    </form>
  );
}
