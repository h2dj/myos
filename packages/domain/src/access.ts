import { can, type WorkspaceAction, type WorkspaceRole } from '@myos/core';
import { schema } from '@myos/db';
import { and, eq, isNull } from 'drizzle-orm';
import type { Actor, Executor } from './context';
import { ForbiddenError, NotFoundError, ValidationError } from './errors';

const { workspaceMembers, workspaces, projects } = schema;

/**
 * 공간 접근 권한을 서버 측에서 검사한다 (기획서 WS-01).
 * 멤버가 아니면 공간의 존재 자체를 드러내지 않도록 NotFound를 던진다.
 */
export async function requireAccess(
  db: Executor,
  actor: Actor,
  workspaceId: string,
  action: WorkspaceAction,
): Promise<WorkspaceRole> {
  const [row] = await db
    .select({ role: workspaceMembers.role })
    .from(workspaceMembers)
    .innerJoin(workspaces, eq(workspaces.id, workspaceMembers.workspaceId))
    .where(
      and(
        eq(workspaceMembers.workspaceId, workspaceId),
        eq(workspaceMembers.userId, actor.userId),
        isNull(workspaces.deletedAt),
      ),
    )
    .limit(1);

  if (!row) throw new NotFoundError('공간');
  if (!can(row.role, action)) throw new ForbiddenError();
  return row.role;
}

/** 연결하려는 프로젝트가 같은 공간에 속하는지 확인한다 (공간 간 데이터 누출 방지) */
export async function assertProjectInWorkspace(
  db: Executor,
  projectId: string,
  workspaceId: string,
) {
  const [p] = await db
    .select({ id: projects.id })
    .from(projects)
    .where(
      and(
        eq(projects.id, projectId),
        eq(projects.workspaceId, workspaceId),
        isNull(projects.deletedAt),
      ),
    );
  if (!p) throw new ValidationError('같은 공간의 프로젝트만 연결할 수 있습니다.');
}
