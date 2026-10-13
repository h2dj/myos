'use client';

import { KPI_METRICS, WIDGET_SIZE_LABEL, WIDGET_SIZES, type WidgetSize } from '@myos/core';
import type { DashboardWidget, Shortcut } from '@myos/domain';
import { useState, useTransition } from 'react';
import { updateWidgetAction } from '@/server/actions/dashboard';
import { Button } from '../ui/button';
import { Field, Input, Select, Textarea } from '../ui/field';
import { FormMessage } from '../ui/form-message';
import { AreaSelect, decodeArea, encodeArea, type AreaOptions } from './area-select';

const LIMITED = new Set(['tasks', 'schedule', 'projects', 'recent_notes']);
const AREA_AWARE = new Set(['tasks', 'schedule', 'projects', 'recent_notes', 'kpi']);

export function WidgetSettings({
  widget,
  areas,
  onDone,
}: {
  widget: DashboardWidget;
  areas: AreaOptions;
  onDone: () => void;
}) {
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();
  const links = (widget.displayConfig.links as Shortcut[] | undefined) ?? [];

  function save(form: FormData) {
    const get = (k: string) => (form.get(k) as string | null) ?? '';
    const displayConfig: Record<string, unknown> = { ...widget.displayConfig };
    if (LIMITED.has(widget.type)) displayConfig.limit = Number(get('limit')) || undefined;
    if (widget.type === 'shortcuts') {
      displayConfig.links = get('links')
        .split('\n')
        .map((line) => line.split('|').map((s) => s.trim()))
        .filter(([label, href]) => label && href)
        .map(([label, href]) => ({ label, href }));
    }
    startTransition(async () => {
      const res = await updateWidgetAction(widget.id, {
        title: get('title') || null,
        size: get('size') as WidgetSize,
        refreshPolicy: get('refresh') as 'on_load' | 'interval_5m',
        ...(AREA_AWARE.has(widget.type) && { filters: decodeArea(get('area')) }),
        ...(widget.type === 'kpi' && { dataSource: get('dataSource') || null }),
        displayConfig,
      });
      if (res.ok) onDone();
      else setError(res.error);
    });
  }

  return (
    <form action={save} className="space-y-4">
      <FormMessage error={error} />
      <Field label="제목">
        <Input
          name="title"
          defaultValue={widget.title ?? ''}
          maxLength={60}
          placeholder="기본 제목 사용"
        />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="크기">
          <Select name="size" defaultValue={widget.size}>
            {WIDGET_SIZES.map((s) => (
              <option key={s} value={s}>
                {WIDGET_SIZE_LABEL[s]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="새로고침">
          <Select name="refresh" defaultValue={widget.refreshPolicy}>
            <option value="on_load">화면을 열 때</option>
            <option value="interval_5m">5분마다</option>
          </Select>
        </Field>
      </div>
      {widget.type === 'kpi' && (
        <Field label="데이터 소스">
          <Select name="dataSource" defaultValue={widget.dataSource ?? ''}>
            <option value="">미설정</option>
            {Object.entries(KPI_METRICS).map(([k, label]) => (
              <option key={k} value={k}>
                {label}
              </option>
            ))}
          </Select>
        </Field>
      )}
      {AREA_AWARE.has(widget.type) && (
        <Field label="영역 (대시보드 필터보다 우선)">
          <AreaSelect name="area" options={areas} defaultValue={encodeArea(widget.filters)} />
        </Field>
      )}
      {LIMITED.has(widget.type) && (
        <Field label="표시 개수">
          <Input
            name="limit"
            type="number"
            min={1}
            max={50}
            defaultValue={(widget.displayConfig.limit as number | undefined) ?? 8}
          />
        </Field>
      )}
      {widget.type === 'shortcuts' && (
        <Field label="링크 (한 줄에 하나, 이름 | /경로)">
          <Textarea
            name="links"
            rows={5}
            defaultValue={links.map((l) => `${l.label} | ${l.href}`).join('\n')}
            placeholder={'할 일 | /tasks\n새 노트 | /knowledge/new'}
          />
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
