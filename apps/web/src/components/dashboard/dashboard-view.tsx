'use client';

import {
  WIDGET_CATALOG,
  WIDGET_TYPES,
  moveItem,
  type PeriodPreset,
  type WidgetType,
} from '@myos/core';
import type { Dashboard, DashboardWidget, WidgetData } from '@myos/domain';
import { ArrowDown, ArrowUp, Eye, EyeOff, Plus, RotateCcw, Settings2, Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useState, useTransition } from 'react';
import {
  addWidgetAction,
  removeWidgetAction,
  reorderWidgetsAction,
  resetDashboardAction,
  updateDashboardAction,
  updateWidgetAction,
} from '@/server/actions/dashboard';
import { Button } from '../ui/button';
import { Dialog } from '../ui/dialog';
import { FormMessage } from '../ui/form-message';
import { AreaSelect, decodeArea, encodeArea, type AreaOptions } from './area-select';
import { WidgetBody, widgetBadge } from './widgets';
import { WidgetSettings } from './widget-settings';

const PERIODS: { key: PeriodPreset; label: string }[] = [
  { key: 'today', label: '오늘' },
  { key: 'week', label: '이번 주' },
  { key: 'all', label: '전체' },
];

/** 12열 그리드에서 위젯 크기별 너비 (모바일은 2열: 작은 위젯만 반 너비) */
const SIZE_CLASS = {
  sm: 'col-span-1 sm:col-span-6 xl:col-span-3',
  md: 'col-span-2 sm:col-span-6 xl:col-span-4',
  lg: 'col-span-2 sm:col-span-12 xl:col-span-6',
  full: 'col-span-2 sm:col-span-12',
} as const;

export function DashboardView({
  dashboard,
  widgets: serverWidgets,
  data,
  areas,
  timeZone,
}: {
  dashboard: Dashboard;
  widgets: DashboardWidget[];
  data: Record<string, WidgetData>;
  areas: AreaOptions;
  timeZone: string;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [adding, setAdding] = useState(false);
  const [configuring, setConfiguring] = useState<DashboardWidget | null>(null);
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();
  // 순서 이동은 즉시 반영하고 서버 저장은 뒤따른다. 서버 목록이 바뀌면 그대로 따른다.
  const [order, setOrder] = useState<{ source: DashboardWidget[]; ids: string[] }>({
    source: serverWidgets,
    ids: serverWidgets.map((w) => w.id),
  });
  const ids = order.source === serverWidgets ? order.ids : serverWidgets.map((w) => w.id);
  const byId = new Map(serverWidgets.map((w) => [w.id, w]));
  const widgets = ids.map((id) => byId.get(id)).filter((w): w is DashboardWidget => !!w);

  // refresh_policy=interval_5m 위젯이 보이면 5분마다 서버 데이터를 다시 받는다
  const needsPolling = widgets.some((w) => !w.hidden && w.refreshPolicy === 'interval_5m');
  useEffect(() => {
    if (!needsPolling) return;
    const timer = setInterval(() => router.refresh(), 5 * 60_000);
    return () => clearInterval(timer);
  }, [needsPolling, router]);

  function run(fn: () => Promise<{ ok: boolean; error?: string }>) {
    setError(undefined);
    startTransition(async () => {
      const res = await fn();
      if (!res.ok) setError(res.error);
    });
  }

  function move(index: number, delta: -1 | 1) {
    const next = moveItem(ids, index, delta);
    setOrder({ source: serverWidgets, ids: next });
    run(() => reorderWidgetsAction(dashboard.id, next));
  }

  const visible = editing ? widgets : widgets.filter((w) => !w.hidden);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <div
            role="group"
            aria-label="기간"
            className="inline-flex rounded-lg border border-border bg-surface p-0.5"
          >
            {PERIODS.map((p) => (
              <button
                key={p.key}
                type="button"
                aria-pressed={dashboard.period === p.key}
                onClick={() => run(() => updateDashboardAction(dashboard.id, { period: p.key }))}
                className={`rounded-md px-3 py-1.5 text-sm ${
                  dashboard.period === p.key
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted hover:text-foreground'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
          <AreaSelect
            aria-label="영역 필터"
            className="!w-auto"
            options={areas}
            value={encodeArea(dashboard.filters)}
            onChange={(e) =>
              run(() =>
                updateDashboardAction(dashboard.id, { filters: decodeArea(e.target.value) }),
              )
            }
          />
        </div>
        <div className="flex gap-2">
          {editing && (
            <>
              <Button variant="secondary" onClick={() => setAdding(true)}>
                <Plus className="size-4" /> 위젯 추가
              </Button>
              <Button
                variant="ghost"
                onClick={() => {
                  if (confirm('대시보드를 기본 구성으로 되돌릴까요?'))
                    run(() => resetDashboardAction(dashboard.id));
                }}
              >
                <RotateCcw className="size-4" /> 초기화
              </Button>
            </>
          )}
          <Button
            variant={editing ? 'primary' : 'secondary'}
            onClick={() => setEditing(!editing)}
            aria-pressed={editing}
          >
            {editing ? '편집 완료' : '대시보드 편집'}
          </Button>
        </div>
      </div>

      <FormMessage error={error} />

      <section
        aria-label="위젯"
        aria-busy={pending}
        className="grid grid-cols-2 gap-3 sm:grid-cols-12 sm:gap-4"
      >
        {visible.map((w) => {
          const index = ids.indexOf(w.id);
          const title = w.title || WIDGET_CATALOG[w.type].label;
          const badge = widgetBadge(data[w.id]);
          return (
            <article
              key={w.id}
              aria-label={title}
              className={`${SIZE_CLASS[w.size]} flex min-w-0 flex-col rounded-xl border bg-surface p-4 sm:p-5 ${
                w.hidden ? 'border-dashed border-border opacity-50' : 'border-border'
              } ${editing ? 'ring-1 ring-accent/30' : ''}`}
            >
              <header className="mb-3 flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
                <h2 className="min-w-0 font-semibold break-keep">
                  {title}
                  {badge && <span className="ml-2 text-sm font-normal text-muted">{badge}</span>}
                </h2>
                {editing && (
                  <div className="-mr-1.5 flex shrink-0 items-center">
                    <IconButton
                      label={`${title} 앞으로 이동`}
                      onClick={() => move(index, -1)}
                      disabled={index === 0}
                    >
                      <ArrowUp className="size-4" />
                    </IconButton>
                    <IconButton
                      label={`${title} 뒤로 이동`}
                      onClick={() => move(index, 1)}
                      disabled={index === ids.length - 1}
                    >
                      <ArrowDown className="size-4" />
                    </IconButton>
                    <IconButton
                      label={w.hidden ? `${title} 표시` : `${title} 숨기기`}
                      onClick={() => run(() => updateWidgetAction(w.id, { hidden: !w.hidden }))}
                    >
                      {w.hidden ? <Eye className="size-4" /> : <EyeOff className="size-4" />}
                    </IconButton>
                    <IconButton label={`${title} 설정`} onClick={() => setConfiguring(w)}>
                      <Settings2 className="size-4" />
                    </IconButton>
                    <IconButton
                      label={`${title} 삭제`}
                      onClick={() => {
                        if (confirm(`'${title}' 위젯을 삭제할까요?`))
                          run(() => removeWidgetAction(w.id));
                      }}
                    >
                      <Trash2 className="size-4" />
                    </IconButton>
                  </div>
                )}
              </header>
              <div className="min-h-0 flex-1">
                {w.hidden ? (
                  <p className="text-sm text-muted">숨긴 위젯</p>
                ) : data[w.id] ? (
                  <WidgetBody data={data[w.id]!} timeZone={timeZone} />
                ) : null}
              </div>
            </article>
          );
        })}
        {visible.length === 0 && (
          <p className="col-span-full rounded-xl border border-dashed border-border bg-surface py-12 text-center text-sm text-muted">
            표시할 위젯이 없습니다. ‘대시보드 편집’에서 위젯을 추가하세요.
          </p>
        )}
      </section>

      <Dialog open={adding} onClose={() => setAdding(false)} title="위젯 추가">
        <ul className="grid gap-2 sm:grid-cols-2">
          {WIDGET_TYPES.map((type: WidgetType) => (
            <li key={type}>
              <button
                type="button"
                disabled={pending}
                onClick={() => {
                  setAdding(false);
                  run(() => addWidgetAction(dashboard.id, type));
                }}
                className="w-full rounded-lg border border-border p-3 text-left hover:border-accent"
              >
                <p className="text-sm font-semibold">{WIDGET_CATALOG[type].label}</p>
                <p className="mt-0.5 text-xs text-muted">{WIDGET_CATALOG[type].description}</p>
              </button>
            </li>
          ))}
        </ul>
      </Dialog>

      <Dialog open={configuring !== null} onClose={() => setConfiguring(null)} title="위젯 설정">
        {configuring && (
          <WidgetSettings
            key={configuring.id}
            widget={configuring}
            areas={areas}
            onDone={() => setConfiguring(null)}
          />
        )}
      </Dialog>
    </div>
  );
}

function IconButton({
  label,
  onClick,
  disabled,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
      className="rounded-md p-1.5 text-muted hover:bg-surface-muted hover:text-foreground disabled:opacity-30"
    >
      {children}
    </button>
  );
}
