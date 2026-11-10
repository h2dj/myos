'use client';

import type { getTaskSequence, TaskSequenceDirection } from '@myos/domain';
import Link from 'next/link';
import { useEffect, useRef, useState, useTransition } from 'react';
import { TASK_STATUS_LABEL } from '@/lib/labels';
import { createSequenceTaskAction, getTaskSequenceAction } from '@/server/actions/tasks';
import { Button } from '../ui/button';
import { FormMessage } from '../ui/form-message';

type Sequence = Awaited<ReturnType<typeof getTaskSequence>>;

/** 할 일의 이전·후속 작업. 새로 만든 작업은 프로젝트·상시 사업/활동을 이어받는다. */
export function TaskSequencePanel({
  taskId,
  onCreated,
}: {
  taskId: string;
  onCreated?: (task: { id: string; title: string }) => void;
}) {
  const [sequence, setSequence] = useState<Sequence>();
  const [error, setError] = useState<string>();
  const [added, setAdded] = useState<string>();
  const [pending, startTransition] = useTransition();
  const generation = useRef(0);

  const load = async () => {
    const version = ++generation.current;
    const res = await getTaskSequenceAction(taskId);
    if (version !== generation.current) return;
    if (!res.ok) return setError(res.error);
    setSequence(res.data);
    setError(undefined);
  };

  useEffect(() => {
    let cancelled = false;
    const version = ++generation.current;
    getTaskSequenceAction(taskId).then((res) => {
      if (cancelled || version !== generation.current) return;
      if (!res.ok) return setError(res.error);
      setSequence(res.data);
      setError(undefined);
    });
    return () => {
      cancelled = true;
    };
  }, [taskId]);

  const create = (direction: TaskSequenceDirection) =>
    startTransition(async () => {
      const res = await createSequenceTaskAction(taskId, direction);
      if (!res.ok) return setError(res.error);
      setAdded(res.data.title);
      await load();
      onCreated?.(res.data);
    });

  const list = (label: string, items: Sequence['previous']) => (
    <div>
      <h3 className="text-sm font-medium">{label}</h3>
      {items.length === 0 ? (
        <p className="text-xs text-muted">없음</p>
      ) : (
        <ul className="divide-y divide-border">
          {items.map((t) => (
            <li key={t.linkId} className="flex items-center justify-between gap-2 py-1.5 text-sm">
              <Link
                href={`/tasks/${t.id}`}
                className={`min-w-0 break-words text-accent ${t.status === 'done' || t.status === 'cancelled' ? 'line-through' : ''}`}
              >
                {t.title}
              </Link>
              <span className="shrink-0 text-xs text-muted">{TASK_STATUS_LABEL[t.status]}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );

  return (
    <section
      aria-label="이전·후속 작업"
      className="space-y-3 rounded-xl border border-border bg-surface p-4"
    >
      <h2 className="font-semibold">이전·후속 작업</h2>
      <p className="text-xs text-muted">
        새 작업은 이 할 일의 프로젝트와 상시 사업·활동을 함께 쓰고, 제목 끝에 (이전) 또는 (후속)이
        붙습니다.
      </p>
      <FormMessage error={error} />
      {!sequence && !error && <p className="text-sm text-muted">불러오는 중…</p>}
      {sequence && (
        <>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {list('이전 작업', sequence.previous)}
            {list('후속 작업', sequence.next)}
          </div>
          {sequence.canWrite && (
            <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3">
              <Button variant="secondary" disabled={pending} onClick={() => create('before')}>
                이전 작업 등록
              </Button>
              <Button variant="secondary" disabled={pending} onClick={() => create('after')}>
                후속 작업 등록
              </Button>
              {added && (
                <span role="status" className="text-xs text-success">
                  ‘{added}’ 등록됨
                </span>
              )}
            </div>
          )}
        </>
      )}
    </section>
  );
}
