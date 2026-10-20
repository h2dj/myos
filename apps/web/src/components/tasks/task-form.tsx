'use client';

import { TASK_STATUS_LABEL } from '@/lib/labels';
import type { ProjectWithProgress, TaskWithTags } from '@myos/domain';
import { useRef, useState, useTransition } from 'react';
import { createTaskAction, updateTaskAction } from '@/server/actions/tasks';
import { Button } from '../ui/button';
import { Field, Input, Select, Textarea } from '../ui/field';
import { FormMessage } from '../ui/form-message';
import { utcToLocalDate } from '@myos/core';

export function TaskForm({
  task,
  projects,
  timeZone,
  defaults,
  onDone,
}: {
  task?: TaskWithTags;
  projects: Pick<ProjectWithProgress, 'id' | 'name'>[];
  timeZone: string;
  defaults?: { projectId?: string; date?: string };
  onDone: () => void;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const titleRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string>();
  const [added, setAdded] = useState<string>();
  const [pending, startTransition] = useTransition();
  const local = (d: Date | null) => (d ? utcToLocalDate(new Date(d), timeZone) : '');

  function submit(form: FormData) {
    startTransition(async () => {
      const res = task ? await updateTaskAction(task.id, form) : await createTaskAction(form);
      if (!res.ok) return setError(res.error);
      if (task || form.get('intent') !== 'continue') return onDone();
      // 계속 추가: 창을 닫지 않고 비운 뒤 제목에 포커스를 둔다
      setError(undefined);
      setAdded(String(form.get('title') ?? ''));
      formRef.current?.reset();
      titleRef.current?.focus();
    });
  }

  return (
    <form ref={formRef} action={submit} className="space-y-4">
      <FormMessage error={error} />
      <Field label="제목">
        <Input
          ref={titleRef}
          name="title"
          required
          defaultValue={task?.title}
          autoFocus
          maxLength={300}
          onChange={() => setAdded(undefined)}
        />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="예정일">
          <Input
            name="date"
            type="date"
            defaultValue={local(task?.scheduledStart ?? null) || defaults?.date}
          />
        </Field>
        <Field label="마감일">
          <Input name="due" type="date" defaultValue={local(task?.dueAt ?? null)} />
        </Field>
        <Field label="우선순위">
          <Select name="priority" defaultValue={task?.priority ?? 'none'}>
            <option value="none">없음</option>
            <option value="low">낮음</option>
            <option value="medium">보통</option>
            <option value="high">높음</option>
          </Select>
        </Field>
        <Field label="프로젝트">
          <Select name="projectId" defaultValue={task?.projectId ?? defaults?.projectId ?? ''}>
            <option value="">없음</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </Select>
        </Field>
        {task && (
          <Field label="상태">
            <Select name="status" defaultValue={task.status}>
              {Object.entries(TASK_STATUS_LABEL).map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </Select>
          </Field>
        )}
      </div>
      {!task && (
        <Field label="반복">
          <Select name="repeat" defaultValue="">
            <option value="">반복 안 함</option>
            <option value="daily">매일</option>
            <option value="weekdays">평일마다</option>
            <option value="weekly">매주 (예정일의 요일)</option>
            <option value="monthly">매월 (예정일의 날짜)</option>
          </Select>
        </Field>
      )}
      <Field label="태그 (쉼표로 구분)">
        <Input
          name="tags"
          placeholder="업무, 기획"
          defaultValue={task?.tags.map((t) => t.name).join(', ')}
        />
      </Field>
      <Field label="메모">
        <Textarea name="description" rows={3} defaultValue={task?.description ?? ''} />
      </Field>
      <div className="flex items-center justify-end gap-2">
        {added && (
          <span role="status" className="mr-auto text-xs text-success">
            ‘{added}’ 추가됨
          </span>
        )}
        <Button variant="secondary" onClick={onDone}>
          {added ? '닫기' : '취소'}
        </Button>
        <Button type="submit" disabled={pending} className="order-2">
          {pending ? '저장 중…' : '저장'}
        </Button>
        {/* Enter는 기존처럼 '저장'(첫 제출 버튼)으로 동작하도록 DOM에서는 뒤에 두고 순서만 바꾼다 */}
        {!task && (
          <Button
            type="submit"
            name="intent"
            value="continue"
            variant="secondary"
            disabled={pending}
            className="order-1"
          >
            추가하고 계속
          </Button>
        )}
      </div>
    </form>
  );
}
