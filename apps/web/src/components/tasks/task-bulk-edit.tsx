'use client';

import type { Activity, ActivityPlace, TaskStatus } from '@myos/domain';
import { useCallback, useMemo, useState, useTransition } from 'react';
import { TASK_STATUS_LABEL } from '@/lib/labels';
import { bulkUpdateTasksAction, type TaskBulkPatch } from '@/server/actions/tasks';
import { Button } from '../ui/button';
import { Field, Select } from '../ui/field';
import { FormMessage } from '../ui/form-message';

/** 보이는 할 일 중에서 고른 것들. 전체선택·해제·반전은 보이는 할 일 기준이다 */
export function useTaskSelection(visibleIds: string[]) {
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const visible = useMemo(() => new Set(visibleIds), [visibleIds]);
  // 필터로 가려진 할 일은 선택에서 뺀다
  const selected = useMemo(
    () => new Set([...picked].filter((id) => visible.has(id))),
    [picked, visible],
  );

  const toggle = useCallback((id: string) => {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);
  const selectAll = useCallback(() => setPicked(new Set(visibleIds)), [visibleIds]);
  const clear = useCallback(() => setPicked(new Set()), []);
  const invert = useCallback(
    () => setPicked((prev) => new Set(visibleIds.filter((id) => !prev.has(id)))),
    [visibleIds],
  );

  return { selected, toggle, selectAll, clear, invert, total: visibleIds.length };
}

export type TaskSelection = ReturnType<typeof useTaskSelection>;

const KEEP = '';
const CLEAR = '__clear';

type ProjectOption = { id: string; name: string };

/** 고른 할 일에 프로젝트·상시 사업/활동·활동처·우선순위·상태를 한 번에 지정한다 */
export function TaskBulkEditBar({
  selection,
  projects,
  activities,
  activityPlaces,
  hideProject,
  onClose,
}: {
  selection: TaskSelection;
  projects: ProjectOption[];
  activities: Activity[];
  activityPlaces: ActivityPlace[];
  hideProject?: boolean;
  onClose: () => void;
}) {
  const { selected, selectAll, clear, invert, total } = selection;
  const [values, setValues] = useState({
    projectId: KEEP,
    activityId: KEEP,
    activityPlaceId: KEEP,
    priority: KEEP,
    status: KEEP,
  });
  const [error, setError] = useState<string>();
  const [done, setDone] = useState<string>();
  const [pending, startTransition] = useTransition();

  const set = (key: keyof typeof values, value: string) => {
    setDone(undefined);
    setValues((prev) => {
      const next = { ...prev, [key]: value };
      // 상시 사업/활동을 고르면 그 활동처를 함께 제안한다 (활동처를 따로 고르지 않았을 때)
      if (key === 'activityId' && prev.activityPlaceId === KEEP) {
        const placeId = activities.find((a) => a.id === value)?.placeId;
        if (placeId) next.activityPlaceId = placeId;
      }
      return next;
    });
  };

  const ref = (v: string) => (v === KEEP ? undefined : v === CLEAR ? null : v);
  const patch: TaskBulkPatch = {
    projectId: ref(values.projectId),
    activityId: ref(values.activityId),
    activityPlaceId: ref(values.activityPlaceId),
    priority: values.priority === KEEP ? undefined : (values.priority as TaskBulkPatch['priority']),
    status: values.status === KEEP ? undefined : (values.status as TaskStatus),
  };
  const hasChange = Object.values(patch).some((v) => v !== undefined);

  function apply() {
    setError(undefined);
    setDone(undefined);
    const ids = [...selected];
    startTransition(async () => {
      const res = await bulkUpdateTasksAction(ids, patch);
      if (!res.ok) return setError(res.error);
      setDone(`${ids.length}개 할 일에 적용했습니다.`);
      setValues({
        projectId: KEEP,
        activityId: KEEP,
        activityPlaceId: KEEP,
        priority: KEEP,
        status: KEEP,
      });
      clear();
    });
  }

  const refOptions = (items: { id: string; name: string }[]) => (
    <>
      <option value={KEEP}>그대로</option>
      <option value={CLEAR}>비우기</option>
      {items.map((p) => (
        <option key={p.id} value={p.id}>
          {p.name}
        </option>
      ))}
    </>
  );

  return (
    <section
      aria-label="일괄 편집"
      className="space-y-3 rounded-xl border border-accent/40 bg-surface p-3"
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-semibold" aria-live="polite">
          {selected.size}/{total}개 선택
        </span>
        <Button variant="secondary" className="!py-1 text-xs" onClick={selectAll}>
          전체 선택
        </Button>
        <Button variant="secondary" className="!py-1 text-xs" onClick={clear}>
          선택 해제
        </Button>
        <Button variant="secondary" className="!py-1 text-xs" onClick={invert}>
          선택 반전
        </Button>
        <Button variant="ghost" className="ml-auto !py-1 text-xs" onClick={onClose}>
          선택 끝내기
        </Button>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
        {!hideProject && (
          <Field label="프로젝트">
            <Select value={values.projectId} onChange={(e) => set('projectId', e.target.value)}>
              {refOptions(projects)}
            </Select>
          </Field>
        )}
        <Field label="상시 사업·활동">
          <Select value={values.activityId} onChange={(e) => set('activityId', e.target.value)}>
            {refOptions(activities)}
          </Select>
        </Field>
        <Field label="활동처">
          <Select
            value={values.activityPlaceId}
            onChange={(e) => set('activityPlaceId', e.target.value)}
          >
            {refOptions(activityPlaces)}
          </Select>
        </Field>
        <Field label="우선순위">
          <Select value={values.priority} onChange={(e) => set('priority', e.target.value)}>
            <option value={KEEP}>그대로</option>
            <option value="high">높음</option>
            <option value="medium">보통</option>
            <option value="low">낮음</option>
            <option value="none">없음</option>
          </Select>
        </Field>
        <Field label="상태">
          <Select value={values.status} onChange={(e) => set('status', e.target.value)}>
            <option value={KEEP}>그대로</option>
            {Object.entries(TASK_STATUS_LABEL).map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button disabled={pending || selected.size === 0 || !hasChange} onClick={apply}>
          {pending ? '적용 중…' : `선택한 ${selected.size}개에 적용`}
        </Button>
        {done && <span className="text-sm text-muted">{done}</span>}
      </div>
      <FormMessage error={error} />
    </section>
  );
}
