import { listAutomations, listRuns } from '@myos/domain';
import type { Metadata } from 'next';
import { AutomationList } from '@/components/automations/automation-list';
import { RunHistory } from '@/components/automations/run-history';
import { PageHeader } from '@/components/page-header';
import { LinkTabs } from '@/components/ui/tabs';
import { requireSession } from '@/server/auth/session';
import { db } from '@/server/db';

export const metadata: Metadata = { title: '자동화' };

export default async function AutomationsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const { tab } = await searchParams;
  const view = tab === 'runs' ? 'runs' : 'rules';
  const { actor, workspace, user } = await requireSession();

  return (
    <>
      <PageHeader
        title="자동화"
        description="반복 관리 규칙을 켜고 끄고, 실행 이력을 확인합니다."
      />
      <LinkTabs
        active={view}
        tabs={[
          { key: 'rules', label: '자동화 규칙', href: '/automations' },
          { key: 'runs', label: '실행 이력', href: '/automations?tab=runs' },
        ]}
      />
      {view === 'rules' ? (
        <AutomationList
          items={await listAutomations(db, actor, workspace.id)}
          timeZone={user.timezone}
        />
      ) : (
        <RunHistory
          runs={await listRuns(db, actor, { workspaceId: workspace.id, limit: 100 })}
          timeZone={user.timezone}
        />
      )}
    </>
  );
}
