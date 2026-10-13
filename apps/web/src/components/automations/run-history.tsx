'use client';

import type { AutomationRun } from '@myos/domain';
import { RotateCcw } from 'lucide-react';
import { useState, useTransition } from 'react';
import { retryRunAction } from '@/server/actions/automations';
import { Button } from '../ui/button';
import { FormMessage } from '../ui/form-message';
import { RunStatusBadge } from './run-status';

type Row = AutomationRun & { name: string };

const TRIGGER = { schedule: '예약', manual: '직접 실행', event: '요청' } as const;

/** 결과 요약을 사람이 읽을 수 있게 */
function summarize(result: Record<string, unknown> | null): string {
  if (!result) return '';
  const parts: string[] = [];
  const labels: Record<string, string> = {
    today: '오늘',
    overdue: '지난',
    inbox: '인박스',
    count: '대상',
    created: '생성',
    series: '시리즈',
    completed: '완료',
    open: '미완료',
  };
  for (const [k, v] of Object.entries(result)) {
    if (typeof v === 'number' && labels[k]) parts.push(`${labels[k]} ${v}`);
    if (k === 'emailed' && v === true) parts.push('이메일 발송');
    if (k === 'skipped' && typeof v === 'string') parts.push(v);
  }
  return parts.join(' · ');
}

export function RunHistory({ runs, timeZone }: { runs: Row[]; timeZone: string }) {
  const [pending, startTransition] = useTransition();
  const [state, setState] = useState<{ error?: string; message?: string }>({});
  const fmt = new Intl.DateTimeFormat('ko-KR', {
    timeZone,
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });

  if (runs.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-border bg-surface py-12 text-center text-sm text-muted">
        아직 실행 기록이 없습니다.
      </p>
    );
  }
  return (
    <div className="space-y-3">
      <FormMessage {...state} />
      <div className="overflow-x-auto rounded-xl border border-border bg-surface">
        <table className="w-full min-w-[40rem] text-sm">
          <thead className="border-b border-border text-left text-xs text-muted">
            <tr>
              <th className="px-4 py-2 font-medium">시작</th>
              <th className="px-4 py-2 font-medium">자동화</th>
              <th className="px-4 py-2 font-medium">실행 방식</th>
              <th className="px-4 py-2 font-medium">상태</th>
              <th className="px-4 py-2 font-medium">시도</th>
              <th className="px-4 py-2 font-medium">결과</th>
              <th className="px-4 py-2" />
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {runs.map((r) => (
              <tr key={r.id}>
                <td className="px-4 py-2.5 whitespace-nowrap tabular-nums">
                  {fmt.format(r.startedAt)}
                </td>
                <td className="px-4 py-2.5">{r.name}</td>
                <td className="px-4 py-2.5 text-muted">{TRIGGER[r.trigger]}</td>
                <td className="px-4 py-2.5">
                  <RunStatusBadge status={r.status} />
                </td>
                <td className="px-4 py-2.5 tabular-nums">{r.attempt}</td>
                <td className="px-4 py-2.5 text-muted">
                  {r.error ? <span className="text-danger">{r.error}</span> : summarize(r.result)}
                  {r.status === 'failed' && r.nextRetryAt && (
                    <span className="block text-xs">자동 재시도 {fmt.format(r.nextRetryAt)}</span>
                  )}
                </td>
                <td className="px-4 py-2.5 text-right">
                  {r.status === 'failed' && (
                    <Button
                      variant="secondary"
                      disabled={pending}
                      onClick={() =>
                        startTransition(async () => {
                          const res = await retryRunAction(r.id);
                          setState(
                            !res.ok
                              ? { error: res.error }
                              : res.data.status === 'succeeded'
                                ? { message: '재시도에 성공했습니다.' }
                                : { error: `재시도 실패: ${res.data.error ?? ''}` },
                          );
                        })
                      }
                    >
                      <RotateCcw className="size-4" /> 재시도
                    </Button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
