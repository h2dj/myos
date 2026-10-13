'use client';

import { RepeatIcon, RotateCcw, Trash2 } from 'lucide-react';
import { useTransition } from 'react';
import { deleteTaskAction, restoreTaskAction, stopSeriesAction } from '@/server/actions/tasks';
import { Button } from '../ui/button';

export function DeleteTaskButton({ taskId, onDeleted }: { taskId: string; onDeleted: () => void }) {
  const [pending, startTransition] = useTransition();
  return (
    <Button
      variant="danger"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          const res = await deleteTaskAction(taskId);
          if (res.ok) onDeleted();
        })
      }
    >
      <Trash2 className="size-4" /> 휴지통으로 이동
    </Button>
  );
}

export function RestoreTaskButton({ taskId }: { taskId: string }) {
  const [pending, startTransition] = useTransition();
  return (
    <Button
      variant="secondary"
      disabled={pending}
      onClick={() => startTransition(async () => void (await restoreTaskAction(taskId)))}
    >
      <RotateCcw className="size-4" /> 복구
    </Button>
  );
}

export function StopSeriesButton({
  seriesId,
  onStopped,
}: {
  seriesId: string;
  onStopped: () => void;
}) {
  const [pending, startTransition] = useTransition();
  return (
    <Button
      variant="secondary"
      disabled={pending}
      onClick={() => {
        if (!confirm('반복을 중지할까요? 이미 만든 할 일은 남아 있습니다.')) return;
        startTransition(async () => {
          const res = await stopSeriesAction(seriesId);
          if (res.ok) onStopped();
        });
      }}
    >
      <RepeatIcon className="size-4" /> 반복 중지
    </Button>
  );
}
