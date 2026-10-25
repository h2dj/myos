'use client';
import { useRef, useState, useTransition } from 'react';
import { FINANCE_CATEGORIES, FINANCE_FREQUENCIES, FINANCE_KIND_LABELS } from '@myos/core';
import type { listFinancePlans } from '@myos/domain';
import { saveFinancePlanAction, postFinancePlanAction } from '@/server/actions/finance-planning';
import { Button } from '../ui/button';
import { Field, Input, Select, Textarea } from '../ui/field';
import { FormMessage } from '../ui/form-message';
import type { FinanceAccount } from './types';
export type FinancePlanRow = Awaited<ReturnType<typeof listFinancePlans>>['plans'][number];
export interface PlanPosting {
  planId: string;
  title: string;
  on: string;
  amount: string;
  actualOn?: string | null;
  restoring?: boolean;
  chooseOccurrence?: boolean;
}
const field = (form: FormData, key: string) => String(form.get(key) ?? '');
export function FinancePlanForm({
  plan,
  kind: initialKind,
  recurring,
  accounts,
  today,
  onDone,
}: {
  plan?: FinancePlanRow;
  kind: 'income' | 'expense';
  recurring: boolean;
  accounts: FinanceAccount[];
  today: string;
  onDone: () => void;
}) {
  const [kind, setKind] = useState(plan?.kind ?? initialKind);
  const [frequency, setFrequency] = useState(plan?.frequency ?? (recurring ? 'monthly' : 'once'));
  const choices = accounts.filter(
    (a) => !a.archivedAt || a.id === plan?.accountId || a.id === plan?.targetAccountId,
  );
  const [accountId, setAccountId] = useState(plan?.accountId ?? choices[0]?.id ?? '');
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();
  const requestId = useRef<string | null>(null);
  return (
    <form
      className="space-y-4"
      action={(form) =>
        startTransition(async () => {
          setError(undefined);
          requestId.current ??= crypto.randomUUID();
          const res = await saveFinancePlanAction(
            {
              title: field(form, 'title'),
              kind,
              frequency,
              accountId,
              targetAccountId: kind === 'transfer' ? field(form, 'targetAccountId') || null : null,
              startOn: field(form, 'startOn'),
              endOn: field(form, 'endOn') || null,
              amount: field(form, 'amount'),
              category: field(form, 'category'),
              note: field(form, 'note'),
            },
            plan?.id ?? requestId.current,
            !!plan,
          );
          if (!res.ok) return setError(res.error);
          onDone();
        })
      }
    >
      <fieldset disabled={pending} className="space-y-4">
        <Field label="예정 이름">
          <Input
            name="title"
            required
            autoFocus
            maxLength={200}
            defaultValue={plan?.title}
            placeholder="월세, 보험료, 급여 등"
          />
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="예정 종류">
            <Select value={kind} onChange={(e) => setKind(e.target.value as typeof kind)}>
              {Object.entries(FINANCE_KIND_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="반복 주기">
            <Select
              value={frequency}
              disabled={!!plan?.processedCount}
              onChange={(e) => setFrequency(e.target.value as typeof frequency)}
            >
              {Object.entries(FINANCE_FREQUENCIES).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="첫 예정일">
            <Input
              type="date"
              name="startOn"
              required
              min="1900-01-01"
              max="2099-12-31"
              readOnly={!!plan?.processedCount}
              defaultValue={plan?.startOn ?? today}
            />
          </Field>
          <Field label="종료일 (선택)">
            <Input
              type="date"
              name="endOn"
              min="1900-01-01"
              max="2099-12-31"
              defaultValue={plan?.endOn ?? ''}
            />
          </Field>
        </div>
        <p className="text-xs text-muted">
          첫 예정일을 기준으로 반복합니다. 해당 날짜가 없는 달에는 말일로 계산하고 다음 회차에는
          원래 날짜를 유지합니다. 처리 이력이 생기면 첫 예정일·주기는 고정됩니다.
        </p>
        <Field label="예정 금액 (원)">
          <Input
            name="amount"
            type="text"
            inputMode="numeric"
            pattern="[1-9][0-9]{0,14}"
            maxLength={15}
            required
            defaultValue={plan?.amount}
          />
        </Field>
        <Field label={kind === 'transfer' ? '출발 계좌' : '예정 계좌'}>
          <Select value={accountId} onChange={(e) => setAccountId(e.target.value)} required>
            <option value="">선택</option>
            {choices.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
                {a.archivedAt ? ' (보관)' : ''}
              </option>
            ))}
          </Select>
        </Field>
        {kind === 'transfer' ? (
          <Field label="도착 계좌">
            <Select name="targetAccountId" required defaultValue={plan?.targetAccountId ?? ''}>
              <option value="">선택</option>
              {choices
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
          <Field label="예정 카테고리">
            <Input
              name="category"
              maxLength={50}
              list="finance-plan-categories"
              defaultValue={plan?.kind === 'transfer' ? '' : (plan?.category ?? '')}
              placeholder="미분류"
            />
          </Field>
        )}
        <datalist id="finance-plan-categories">
          {FINANCE_CATEGORIES.map((c) => (
            <option key={c} value={c} />
          ))}
        </datalist>
        <Field label="예정 메모">
          <Textarea name="note" maxLength={1000} rows={2} defaultValue={plan?.note} />
        </Field>
        <FormMessage error={error} />
        <Button type="submit" disabled={pending}>
          {pending ? '저장 중…' : '예정 저장'}
        </Button>
      </fieldset>
    </form>
  );
}
export function FinancePlanPostingForm({
  posting,
  today,
  onDone,
}: {
  posting: PlanPosting;
  today: string;
  onDone: () => void;
}) {
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();
  return (
    <form
      className="space-y-4"
      action={(form) =>
        startTransition(async () => {
          setError(undefined);
          const res = await postFinancePlanAction(posting.planId, field(form, 'on'), {
            amount: field(form, 'amount'),
            occurredOn: field(form, 'occurredOn'),
          });
          if (!res.ok) return setError(res.error);
          onDone();
        })
      }
    >
      <p className="text-sm break-words">{posting.title}</p>
      <Field label="처리할 예정 회차">
        <Input
          type="date"
          name="on"
          min="1900-01-01"
          max="2099-12-31"
          required
          readOnly={!posting.chooseOccurrence}
          defaultValue={posting.on}
        />
      </Field>
      {posting.restoring && (
        <p className="text-sm text-muted">
          삭제된 기존 거래를 원래 날짜·금액으로 복원합니다. 세부 내용은 거래 내역에서 수정할 수
          있습니다.
        </p>
      )}
      <Field label="실제 거래일">
        <Input
          type="date"
          name="occurredOn"
          min="1900-01-01"
          max={today}
          required
          readOnly={posting.restoring}
          defaultValue={posting.restoring ? (posting.actualOn ?? today) : today}
        />
      </Field>
      <Field label="실제 금액 (원)">
        <Input
          type="text"
          name="amount"
          required
          inputMode="numeric"
          pattern="[1-9][0-9]{0,14}"
          maxLength={15}
          readOnly={posting.restoring}
          defaultValue={posting.amount}
        />
      </Field>
      <p className="text-xs text-muted">
        확정하면 실제 거래로 기록되고 해당 회차는 예정 합계에서 빠집니다. 미래 예정도 실제로 미리
        지급·수령했다면 오늘까지의 거래일로 확정할 수 있습니다.
      </p>
      <FormMessage error={error} />
      <Button type="submit" disabled={pending}>
        {posting.restoring ? '기존 거래 복원' : '거래로 확정'}
      </Button>
    </form>
  );
}
