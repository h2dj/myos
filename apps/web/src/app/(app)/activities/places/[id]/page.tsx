import { getActivityPlace, NotFoundError } from '@myos/domain';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { PageHeader } from '@/components/page-header';
import { RelatedItemsPanel } from '@/components/relations/related-items-panel';
import { requireSession } from '@/server/auth/session';
import { db } from '@/server/db';
export default async function PlaceDetail({ params }: { params: Promise<{ id: string }> }) {
  const { actor } = await requireSession();
  const { id } = await params;
  const place = await getActivityPlace(db, actor, id).catch((error) => {
    if (error instanceof NotFoundError) notFound();
    throw error;
  });
  return (
    <>
      <Link href="/activities" className="text-sm text-muted">
        ← 활동처 목록
      </Link>
      <PageHeader title={place.name} description={place.description ?? undefined} />
      <p className="mb-4">
        <Link className="text-accent" href={`/search?place=${id}`}>
          이 활동처의 항목 조회
        </Link>
      </p>
      <RelatedItemsPanel source={{ type: 'place', id }} />
    </>
  );
}
