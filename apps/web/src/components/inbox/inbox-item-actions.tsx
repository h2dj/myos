'use client';

import { Archive, CheckSquare, FileText, Lightbulb, RotateCcw } from 'lucide-react';
import { useState, useTransition } from 'react';
import { archiveInboxAction, convertInboxAction, reopenInboxAction } from '@/server/actions/inbox';
import { Button } from '../ui/button';

export function InboxItemActions({ itemId, processed }: { itemId: string; processed: boolean }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string>();
  const run = (fn: () => Promise<{ ok: boolean; error?: string }>) =>
    startTransition(async () => {
      const res = await fn();
      setError(res.ok ? undefined : res.error);
    });

  if (processed) {
    return (
      <Button
        variant="ghost"
        disabled={pending}
        onClick={() => run(() => reopenInboxAction(itemId))}
      >
        <RotateCcw className="size-4" /> 되돌리기
      </Button>
    );
  }
  return (
    <div className="flex flex-wrap items-center gap-1">
      {error && <span className="text-xs text-danger">{error}</span>}
      <Button
        variant="secondary"
        disabled={pending}
        onClick={() => run(() => convertInboxAction(itemId, 'task'))}
      >
        <CheckSquare className="size-4" /> 할 일
      </Button>
      <Button
        variant="secondary"
        disabled={pending}
        onClick={() => run(() => convertInboxAction(itemId, 'note'))}
      >
        <FileText className="size-4" /> 노트
      </Button>
      <Button
        variant="secondary"
        disabled={pending}
        onClick={() => run(() => convertInboxAction(itemId, 'idea'))}
      >
        <Lightbulb className="size-4" /> 아이디어
      </Button>
      <Button
        variant="ghost"
        disabled={pending}
        onClick={() => run(() => archiveInboxAction(itemId))}
      >
        <Archive className="size-4" /> 보관
      </Button>
    </div>
  );
}
