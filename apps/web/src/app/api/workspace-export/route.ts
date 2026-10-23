import { exportWorkspaceBackup, DomainError } from '@myos/domain';
import { requireSession } from '@/server/auth/session';
import { db } from '@/server/db';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET() {
  const { actor, workspace } = await requireSession();
  const headers = { 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' };
  try {
    const backup = await exportWorkspaceBackup(db, actor, workspace.id);
    return new Response(JSON.stringify(backup), {
      headers: {
        ...headers,
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Disposition': `attachment; filename="myos-workspace-${new Date().toISOString().slice(0, 10)}.json"`,
      },
    });
  } catch (err) {
    if (err instanceof DomainError)
      return Response.json(
        { error: err.message },
        { status: err.code === 'FORBIDDEN' ? 403 : err.code === 'NOT_FOUND' ? 404 : 400, headers },
      );
    throw err;
  }
}
