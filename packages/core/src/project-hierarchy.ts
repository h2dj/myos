export interface ProjectNode {
  id: string;
  name: string;
  parentId?: string | null;
}

/** 선택창과 목록에 쓸 경로. 필터로 빠진 부모와 이전 데이터의 순환에도 안전하다. */
export function projectPath(project: ProjectNode, projects: ProjectNode[]): string {
  const byId = new Map(projects.map((p) => [p.id, p]));
  const names = [project.name];
  const visited = new Set([project.id]);
  let parent = project.parentId ? byId.get(project.parentId) : undefined;
  while (parent && !visited.has(parent.id)) {
    visited.add(parent.id);
    names.unshift(parent.name);
    parent = parent.parentId ? byId.get(parent.parentId) : undefined;
  }
  return names.join(' / ');
}
