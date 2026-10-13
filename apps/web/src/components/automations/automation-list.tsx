'use client';

import type { AutomationView } from '@myos/domain';
import { Play, Settings2 } from 'lucide-react';
import { useState, useTransition } from 'react';
import { runAutomationNowAction, updateAutomationAction } from '@/server/actions/automations';
import { Button } from '../ui/button';
import { Dialog } from '../ui/dialog';
import { FormMessage } from '../ui/form-message';
import { AutomationSettings } from './automation-settings';
import { RunStatusBadge } from './run-status';

export function AutomationList({ items, timeZone }: { items: AutomationView[]; timeZone: string }) {
  const [configuring, setConfiguring] = useState<AutomationView | null>(null);
  const [state, setState] = useState<{ error?: string; message?: string }>({});
  const [pending, startTransition] = useTransition();
  const fmt = new Intl.DateTimeFormat('ko-KR', {
    timeZone,
    month: 'numeric',
    day: 'numeric',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });

  const run = (a: AutomationView) =>
    startTransition(async () => {
      const res = await runAutomationNowAction(a.id);
      if (!res.ok) return setState({ error: res.error });
      setState(
        res.data.status === 'succeeded'
          ? { message: `'${a.definition.name}'을(를) 실행했습니다.` }
          : {
              error: `'${a.definition.name}' 실행 ${res.data.status === 'skipped' ? '건너뜀' : '실패'}: ${res.data.error ?? ''}`,
            },
      );
    });

  return (
    <div className="space-y-3">
      <FormMessage {...state} />
      <ul className="divide-y divide-border rounded-xl border border-border bg-surface">
        {items.map((a) => (
          <li
            key={a.id}
            className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-4 sm:flex-nowrap"
          >
            <span className="w-9 shrink-0 rounded-md bg-accent-soft py-1 text-center text-xs font-semibold text-accent">
              {a.definition.code}
            </span>
            <div className="min-w-0 flex-1">
              <p className="font-medium">{a.definition.name}</p>
              <p className="text-sm text-muted">{a.definition.description}</p>
              <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
                <span>{a.definition.scheduleText}</span>
                {a.enabled && a.nextRunAt && <span>다음 실행 {fmt.format(a.nextRunAt)}</span>}
                {a.lastRun && (
                  <span className="inline-flex items-center gap-1">
                    최근 <RunStatusBadge status={a.lastRun.status} />{' '}
                    {fmt.format(a.lastRun.startedAt)}
                  </span>
                )}
              </p>
            </div>
            <div className="flex items-center gap-1">
              {a.definition.manualRun && (
                <Button
                  variant="ghost"
                  disabled={pending}
                  onClick={() => run(a)}
                  aria-label={`${a.definition.name} 지금 실행`}
                >
                  <Play className="size-4" /> 지금 실행
                </Button>
              )}
              <Button
                variant="ghost"
                onClick={() => setConfiguring(a)}
                aria-label={`${a.definition.name} 설정`}
              >
                <Settings2 className="size-4" />
              </Button>
              <Toggle
                label={`${a.definition.name} 사용`}
                checked={a.enabled}
                disabled={pending}
                onChange={(enabled) =>
                  startTransition(async () => {
                    const res = await updateAutomationAction(a.id, { enabled });
                    setState(res.ok ? {} : { error: res.error });
                  })
                }
              />
            </div>
          </li>
        ))}
      </ul>
      <Dialog open={configuring !== null} onClose={() => setConfiguring(null)} title="자동화 설정">
        {configuring && (
          <AutomationSettings
            key={configuring.id}
            automation={configuring}
            onDone={() => setConfiguring(null)}
          />
        )}
      </Dialog>
    </div>
  );
}

function Toggle({
  label,
  checked,
  disabled,
  onChange,
}: {
  label: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative h-6 w-11 shrink-0 rounded-full transition ${checked ? 'bg-accent' : 'bg-border'} disabled:opacity-60`}
    >
      <span
        className={`absolute top-0.5 left-0.5 size-5 rounded-full bg-white shadow transition ${checked ? 'translate-x-5' : ''}`}
      />
    </button>
  );
}
