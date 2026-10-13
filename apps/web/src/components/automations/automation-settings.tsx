'use client';

import type { AutomationView } from '@myos/domain';
import { useState, useTransition } from 'react';
import { updateAutomationAction } from '@/server/actions/automations';
import { Button } from '../ui/button';
import { Field, Input, Select } from '../ui/field';
import { FormMessage } from '../ui/form-message';

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

/** 템플릿별 설정 항목 (기획서 §3: 설정 가능한 6개 템플릿) */
export function AutomationSettings({
  automation,
  onDone,
}: {
  automation: AutomationView;
  onDone: () => void;
}) {
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();
  const c = automation.config as Record<string, string | number | boolean | null>;

  function save(form: FormData) {
    const get = (k: string) => (form.get(k) as string | null) ?? '';
    const config: Record<string, unknown> = {};
    switch (automation.template) {
      case 'morning_briefing':
        Object.assign(config, {
          time: get('time'),
          weekdaysOnly: form.get('weekdaysOnly') === 'on',
        });
        break;
      case 'deadline_alert':
        Object.assign(config, { time: get('time'), daysBefore: Number(get('daysBefore')) });
        break;
      case 'recurring_tasks':
        Object.assign(config, { time: get('time') });
        break;
      case 'weekly_review':
        Object.assign(config, { time: get('time'), weekday: Number(get('weekday')) });
        break;
      case 'note_to_task':
        Object.assign(config, {
          dueInDays: get('dueInDays') === '' ? null : Number(get('dueInDays')),
        });
        break;
      case 'shared_change_alert':
        Object.assign(config, { intervalMinutes: Number(get('intervalMinutes')) });
        break;
    }
    startTransition(async () => {
      const res = await updateAutomationAction(automation.id, { config });
      if (res.ok) onDone();
      else setError(res.error);
    });
  }

  const timeField = (
    <Field label="실행 시각">
      <Input name="time" type="time" required defaultValue={String(c.time ?? '')} />
    </Field>
  );

  return (
    <form action={save} className="space-y-4">
      <p className="text-sm text-muted">
        <strong className="text-foreground">{automation.definition.name}</strong> ·{' '}
        {automation.definition.description}
      </p>
      <FormMessage error={error} />
      {automation.template === 'morning_briefing' && (
        <>
          {timeField}
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              name="weekdaysOnly"
              defaultChecked={Boolean(c.weekdaysOnly)}
              className="size-4 accent-accent"
            />
            평일에만 보내기
          </label>
        </>
      )}
      {automation.template === 'deadline_alert' && (
        <div className="grid grid-cols-2 gap-3">
          {timeField}
          <Field label="며칠 전부터 알림">
            <Input
              name="daysBefore"
              type="number"
              min={0}
              max={14}
              defaultValue={Number(c.daysBefore ?? 1)}
            />
          </Field>
        </div>
      )}
      {automation.template === 'recurring_tasks' && timeField}
      {automation.template === 'weekly_review' && (
        <div className="grid grid-cols-2 gap-3">
          <Field label="요일">
            <Select name="weekday" defaultValue={String(c.weekday ?? 5)}>
              {WEEKDAYS.map((d, i) => (
                <option key={d} value={i}>
                  {d}요일
                </option>
              ))}
            </Select>
          </Field>
          {timeField}
        </div>
      )}
      {automation.template === 'note_to_task' && (
        <Field label="마감일 (만든 날로부터 며칠 뒤, 비우면 없음)">
          <Input
            name="dueInDays"
            type="number"
            min={0}
            max={60}
            defaultValue={c.dueInDays === null ? '' : Number(c.dueInDays)}
          />
        </Field>
      )}
      {automation.template === 'shared_change_alert' && (
        <Field label="확인 주기">
          <Select name="intervalMinutes" defaultValue={String(c.intervalMinutes ?? 5)}>
            {[5, 15, 30, 60].map((m) => (
              <option key={m} value={m}>
                {m}분마다
              </option>
            ))}
          </Select>
        </Field>
      )}
      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={onDone}>
          취소
        </Button>
        <Button type="submit" disabled={pending}>
          {pending ? '저장 중…' : '저장'}
        </Button>
      </div>
    </form>
  );
}
