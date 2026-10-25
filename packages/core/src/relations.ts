export const RELATION_LABELS = {
  project: '프로젝트',
  activity: '사업·활동',
  place: '활동처',
  task: '할 일',
  note: '지식·아이디어',
} as const;
export type RelationKind = keyof typeof RELATION_LABELS;
export interface RelationRef {
  type: RelationKind;
  id: string;
}
export const RELATION_TARGETS: Record<RelationKind, RelationKind[]> = {
  project: ['activity', 'note'],
  activity: ['activity', 'project', 'note'],
  place: ['note'],
  task: ['note'],
  note: ['project', 'activity', 'place', 'task'],
};
export function relationHref(ref: RelationRef) {
  return ref.type === 'project'
    ? `/projects/${ref.id}`
    : ref.type === 'task'
      ? `/tasks/${ref.id}`
      : ref.type === 'note'
        ? `/knowledge/${ref.id}`
        : ref.type === 'place'
          ? `/activities/places/${ref.id}`
          : `/activities/${ref.id}`;
}
export function canonicalRelation(a: RelationRef, b: RelationRef): [RelationRef, RelationRef] {
  return `${a.type}:${a.id}` < `${b.type}:${b.id}` ? [a, b] : [b, a];
}
