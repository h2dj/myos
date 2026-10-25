'use client';
import { useEffect, useRef, useState, useTransition } from 'react';
import type { getFinanceComments } from '@myos/domain';
import {
  deleteFinanceCommentAction,
  getFinanceCommentsAction,
  saveFinanceCommentAction,
} from '@/server/actions/finance';
import { Button } from '../ui/button';
import { Field, Textarea } from '../ui/field';
import { FormMessage } from '../ui/form-message';

type Page = Awaited<ReturnType<typeof getFinanceComments>>;
export function FinanceCommentsPanel({
  target,
  timeZone,
}: {
  target: { kind: 'account' | 'budget'; id: string };
  timeZone: string;
}) {
  const { kind, id } = target;
  const [data, setData] = useState<Page>();
  const [page, setPage] = useState(1);
  const [revision, setRevision] = useState(0);
  const [body, setBody] = useState('');
  const [editing, setEditing] = useState<string>();
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();
  const requestId = useRef<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    getFinanceCommentsAction({ kind, id }, page).then((res) => {
      if (cancelled) return;
      if (!res.ok) {
        setData(undefined);
        setError(res.error);
        return;
      }
      setData(res.data);
      setError(undefined);
    });
    return () => {
      cancelled = true;
    };
  }, [kind, id, page, revision]);
  const refresh = () => setRevision((value) => value + 1);
  const date = (value: Date) =>
    new Intl.DateTimeFormat('ko-KR', { timeZone, dateStyle: 'short', timeStyle: 'short' }).format(
      new Date(value),
    );
  return (
    <section aria-label="계좌·예산 추가 메모" className="space-y-4">
      <FormMessage error={error} />
      {!data && !error && <p className="text-sm text-muted">메모를 불러오는 중…</p>}
      {data && (
        <>
          <div className="rounded-lg bg-surface-muted p-3 text-sm">
            <h3 className="font-medium">설명</h3>
            <p className="mt-1 whitespace-pre-wrap break-words">
              {data.description || '등록된 설명이 없습니다.'}
            </p>
            <p className="mt-2 text-xs text-muted">
              기본 설명은 계좌·예산 수정 화면에서 편집할 수 있습니다.
            </p>
          </div>
          <h3 className="font-semibold">추가 메모 ({data.total}개)</h3>
          {data.comments.length === 0 && (
            <p className="text-sm text-muted">날짜별로 보충할 내용을 남겨 보세요.</p>
          )}
          <ul className="divide-y divide-border">
            {data.comments.map((comment) => (
              <li key={comment.id} className="space-y-2 py-3">
                <p className="whitespace-pre-wrap break-words text-sm">{comment.body}</p>
                <p className="text-xs text-muted">
                  {date(comment.createdAt)}
                  {new Date(comment.updatedAt).getTime() !== new Date(comment.createdAt).getTime()
                    ? ` · 수정 ${date(comment.updatedAt)}`
                    : ''}
                </p>
                <div className="flex gap-2">
                  <Button
                    variant="ghost"
                    disabled={pending}
                    aria-label={`${comment.body} 메모 수정`}
                    onClick={() => {
                      setEditing(comment.id);
                      setBody(comment.body);
                      setError(undefined);
                    }}
                  >
                    수정
                  </Button>
                  <Button
                    variant="ghost"
                    disabled={pending}
                    aria-label={`${comment.body} 메모 삭제`}
                    onClick={() => {
                      if (!window.confirm('이 추가 메모를 삭제할까요?')) return;
                      startTransition(async () => {
                        const res = await deleteFinanceCommentAction({ kind, id }, comment.id);
                        if (!res.ok) return setError(res.error);
                        if (editing === comment.id) {
                          setEditing(undefined);
                          setBody('');
                        }
                        refresh();
                      });
                    }}
                  >
                    삭제
                  </Button>
                </div>
              </li>
            ))}
          </ul>
          <nav aria-label="추가 메모 페이지" className="flex flex-wrap items-center gap-3 text-sm">
            {data.page > 1 && (
              <Button variant="ghost" disabled={pending} onClick={() => setPage(data.page - 1)}>
                이전 메모
              </Button>
            )}
            <span>
              {data.page} / {data.pages} 페이지
            </span>
            {data.page < data.pages && (
              <Button variant="ghost" disabled={pending} onClick={() => setPage(data.page + 1)}>
                다음 메모
              </Button>
            )}
          </nav>
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              startTransition(async () => {
                setError(undefined);
                requestId.current ??= crypto.randomUUID();
                const res = await saveFinanceCommentAction(
                  { kind, id },
                  { body },
                  editing ?? requestId.current,
                  !!editing,
                );
                if (!res.ok) return setError(res.error);
                setBody('');
                setEditing(undefined);
                requestId.current = null;
                setPage(1);
                refresh();
              });
            }}
          >
            <Field label="추가 메모 내용">
              <Textarea
                rows={3}
                required
                maxLength={3000}
                disabled={pending}
                value={body}
                onChange={(e) => setBody(e.target.value)}
              />
            </Field>
            <div className="flex gap-2">
              <Button type="submit" disabled={pending || !body.trim()}>
                {editing ? '메모 수정 저장' : '메모 추가'}
              </Button>
              {editing && (
                <Button
                  variant="secondary"
                  disabled={pending}
                  onClick={() => {
                    setBody('');
                    setEditing(undefined);
                  }}
                >
                  수정 취소
                </Button>
              )}
            </div>
          </form>
        </>
      )}
    </section>
  );
}
