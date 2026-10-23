import type { Metadata } from 'next';
import Link from 'next/link';
import { PageHeader } from '@/components/page-header';
import { NotionImporter } from '@/components/integrations/notion-importer';
import { requireSession } from '@/server/auth/session';

export const metadata: Metadata = { title: 'Notion 가져오기' };
export default async function NotionImportPage() {
  const { workspace, user } = await requireSession();
  return (
    <>
      <Link href="/settings" className="text-sm text-muted">
        ← 설정
      </Link>
      <PageHeader
        title="Notion 가져오기"
        description={`${workspace.name} 공간에 파일의 속성을 매핑하고, 미리보기 후 최대 10건을 표본으로 저장합니다.`}
      />
      {workspace.role === 'owner' ? (
        <NotionImporter key={`${workspace.id}:${user.timezone}`} timeZone={user.timezone} />
      ) : (
        <p>공간 소유자만 가져올 수 있습니다.</p>
      )}
    </>
  );
}
