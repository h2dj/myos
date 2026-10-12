import { unreadNotificationCount } from '@myos/domain';
import { AppShell } from '@/components/app-shell';
import { requireSession } from '@/server/auth/session';
import { db } from '@/server/db';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { actor, user, workspace } = await requireSession();
  const unread = await unreadNotificationCount(db, actor);
  return (
    <AppShell
      user={{ name: user.name, email: user.email }}
      workspaceName={workspace.name}
      unread={unread}
    >
      {children}
    </AppShell>
  );
}
