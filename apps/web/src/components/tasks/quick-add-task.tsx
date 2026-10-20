'use client';

import { Plus } from 'lucide-react';
import { useRef, useState, useTransition } from 'react';
import { createTaskAction } from '@/server/actions/tasks';
import { Input } from '../ui/field';

/** 제목만 입력하고 Enter로 바로 추가 (예정일 기본값: 오늘) */
export function QuickAddTask({
  defaultDate,
  projectId,
}: {
  defaultDate: string;
  projectId?: string;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const titleRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();

  return (
    <form
      ref={formRef}
      action={(form) =>
        startTransition(async () => {
          const res = await createTaskAction(form);
          if (res.ok) {
            formRef.current?.reset();
            setError(undefined);
          } else setError(res.error);
          // 연속 입력: 추가 직후 바로 다음 할 일을 입력할 수 있게 포커스를 되돌린다
          titleRef.current?.focus();
        })
      }
      className="flex min-w-0 flex-1 items-center gap-2"
    >
      <div className="relative min-w-0 flex-1">
        <Plus className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" />
        <Input
          ref={titleRef}
          name="title"
          required
          aria-label="새 할 일 제목"
          placeholder="할 일을 입력하고 Enter"
          className="pl-9"
          aria-invalid={!!error}
          title={error}
          // disabled는 포커스를 빼앗으므로 저장 중에는 readOnly로만 막는다
          readOnly={pending}
        />
      </div>
      <Input
        name="date"
        type="date"
        defaultValue={defaultDate}
        aria-label="예정일"
        className="!w-auto"
      />
      {projectId && <input type="hidden" name="projectId" value={projectId} />}
      {error && (
        <span role="alert" className="text-xs text-danger">
          {error}
        </span>
      )}
    </form>
  );
}
