/**
 * 공간 권한 (기획서 §7)
 * - viewer: 읽기만
 * - editor: 항목 생성·수정·삭제(휴지통 이동)·복구
 * - owner: 초대·자동화 설정·영구 삭제 등 관리
 */
export const WORKSPACE_ROLES = ['owner', 'editor', 'viewer'] as const;
export type WorkspaceRole = (typeof WORKSPACE_ROLES)[number];

export type WorkspaceAction = 'read' | 'write' | 'manage';

const ALLOWED: Record<WorkspaceRole, readonly WorkspaceAction[]> = {
  owner: ['read', 'write', 'manage'],
  editor: ['read', 'write'],
  viewer: ['read'],
};

export function can(role: WorkspaceRole, action: WorkspaceAction): boolean {
  return ALLOWED[role].includes(action);
}
