import { getActivity, NotFoundError } from '@myos/domain';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { PageHeader } from '@/components/page-header';
import { RelatedItemsPanel } from '@/components/relations/related-items-panel';
import { requireSession } from '@/server/auth/session';
import { db } from '@/server/db';
export default async function ActivityDetail({ params }: { params: Promise<{ id: string }> }) {
  const { actor } = await requireSession();
  const { id } = await params;
  const activity = await getActivity(db, actor, id).catch((error) => {
    if (error instanceof NotFoundError) notFound();
    throw error;
  });
  return (
    <>
      <Link href="/activities" className="text-sm text-muted">
        ← 사업·활동 목록
      </Link>
      <PageHeader title={activity.name} description={activity.description ?? undefined} />
      <p className="mb-4">
        <Link className="text-accent" href={`/search?type=task&activity=${id}`}>
          이 사업·활동의 할 일 조회
        </Link>
      </p>
      <RelatedItemsPanel source={{ type: 'activity', id }} />
    </>
  );
}
