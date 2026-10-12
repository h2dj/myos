import { listInbox } from '@myos/domain';
import type { Metadata } from 'next';
import Link from 'next/link';
import { InboxItemActions } from '@/components/inbox/inbox-item-actions';
import { QuickCapture } from '@/components/inbox/quick-capture';
import { PageHeader } from '@/components/page-header';
import { requireSession } from '@/server/auth/session';
import { db } from '@/server/db';

export const metadata: Metadata = { title: '인박스' };

const RESULT_LABEL = { task: '할 일로 변환', note: '노트로 변환', archived: '보관됨' } as const;

export default async function InboxPage() {
  const { actor, workspace, user } = await requireSession();
  const [pending, processed] = await Promise.all([
    listInbox(db, actor, { workspaceId: workspace.id }),
    listInbox(db, actor, { workspaceId: workspace.id, processed: true, limit: 20 }),
  ]);
  const time = new Intl.DateTimeFormat('ko-KR', {
    timeZone: user.timezone,
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <>
      <PageHeader title="인박스" description="떠오른 메모·할 일·링크를 빠르게 모으고 분류합니다." />
      <section className="mb-8 rounded-xl border border-border bg-surface p-5">
        <QuickCapture source="quick_input" autoFocus />
      </section>

      <h2 className="mb-3 font-semibold">
        분류 대기 <span className="text-sm text-muted">{pending.length}</span>
      </h2>
      <ul className="space-y-2">
        {pending.length === 0 && (
          <li className="rounded-xl border border-dashed border-border bg-surface py-10 text-center text-sm text-muted">
            모두 분류했습니다 🎉
          </li>
        )}
        {pending.map((item) => (
          <li key={item.id} className="rounded-xl border border-border bg-surface p-4">
            <p className="text-sm whitespace-pre-wrap">{item.content}</p>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs text-muted">{time.format(item.createdAt)}</span>
              <InboxItemActions itemId={item.id} processed={false} />
            </div>
          </li>
        ))}
      </ul>

      {processed.length > 0 && (
        <details className="mt-8">
          <summary className="cursor-pointer text-sm font-semibold text-muted">
            최근 처리한 항목
          </summary>
          <ul className="mt-3 divide-y divide-border rounded-xl border border-border bg-surface">
            {processed.map((item) => (
              <li key={item.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                <div className="min-w-0">
                  <p className="truncate text-sm">{item.content}</p>
                  <p className="text-xs text-muted">
                    {item.result && RESULT_LABEL[item.result]}
                    {item.result === 'note' && item.resultId && (
                      <Link href={`/knowledge/${item.resultId}`} className="ml-2 text-accent">
                        열기
                      </Link>
                    )}
                  </p>
                </div>
                {item.result === 'archived' && <InboxItemActions itemId={item.id} processed />}
              </li>
            ))}
          </ul>
        </details>
      )}
    </>
  );
}
