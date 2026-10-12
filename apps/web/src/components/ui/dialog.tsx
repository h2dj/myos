'use client';

import { X } from 'lucide-react';
import { useEffect, useRef } from 'react';

/** 네이티브 <dialog> 기반 모달 (포커스 가두기·ESC 닫기를 브라우저가 처리) */
export function Dialog({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      aria-label={title}
      className="m-auto w-[min(32rem,calc(100vw-2rem))] rounded-2xl border border-border bg-surface p-0 text-foreground shadow-xl backdrop:bg-black/30"
    >
      {open && (
        <div className="p-6">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-bold">{title}</h2>
            <button
              type="button"
              onClick={onClose}
              aria-label="닫기"
              className="rounded-md p-1 text-muted hover:bg-surface-muted"
            >
              <X className="size-5" />
            </button>
          </div>
          {children}
        </div>
      )}
    </dialog>
  );
}
