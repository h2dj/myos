'use client';

import { useRef, useState, useTransition } from 'react';
import { captureInboxAction } from '@/server/actions/inbox';
import { Button } from '../ui/button';
import { Textarea } from '../ui/field';
import { FormMessage } from '../ui/form-message';

/** 빠른 기록 (INBOX-01). Ctrl/Cmd+Enter로 저장, 저장 즉시 인박스에 반영된다. */
export function QuickCapture({
  source,
  autoFocus,
}: {
  source: 'quick_input' | 'dashboard';
  autoFocus?: boolean;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const [error, setError] = useState<string>();
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();

  function submit() {
    const content = ref.current?.value ?? '';
    if (!content.trim()) return;
    startTransition(async () => {
      const res = await captureInboxAction(content, source);
      if (!res.ok) return setError(res.error);
      setError(undefined);
      setSaved(true);
      if (ref.current) ref.current.value = '';
      ref.current?.focus();
    });
  }

  return (
    <div className="space-y-2">
      <FormMessage error={error} />
      <Textarea
        ref={ref}
        rows={3}
        autoFocus={autoFocus}
        aria-label="빠른 기록"
        placeholder="지금 떠오른 생각을 기록해보세요… (Ctrl+Enter 저장)"
        onChange={() => setSaved(false)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            submit();
          }
        }}
      />
      <div className="flex items-center justify-end gap-3">
        {saved && (
          <span role="status" className="text-xs text-success">
            인박스에 저장했습니다
          </span>
        )}
        <Button onClick={submit} disabled={pending}>
          {pending ? '저장 중…' : '인박스에 저장'}
        </Button>
      </div>
    </div>
  );
}
