import { listProjects } from '@myos/domain';
import type { Metadata } from 'next';
import { NoteEditor } from '@/components/knowledge/note-editor';
import { NOTE_TYPE_LABEL } from '@/lib/labels';
import { requireSession } from '@/server/auth/session';
import { db } from '@/server/db';

export const metadata: Metadata = { title: '새 노트' };

export default async function NewNotePage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string }>;
}) {
  const { type } = await searchParams;
  const { actor, workspace } = await requireSession();
  const projects = await listProjects(db, actor, { workspaceId: workspace.id });
  const defaultType =
    type && type in NOTE_TYPE_LABEL ? (type as keyof typeof NOTE_TYPE_LABEL) : 'note';
  return (
    <NoteEditor
      projects={projects.map((p) => ({ id: p.id, name: p.name }))}
      defaultType={defaultType}
    />
  );
}
