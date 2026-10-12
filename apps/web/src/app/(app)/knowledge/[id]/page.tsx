import { NotFoundError, getNote, listProjects } from '@myos/domain';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { NoteEditor } from '@/components/knowledge/note-editor';
import { requireSession } from '@/server/auth/session';
import { db } from '@/server/db';

export const metadata: Metadata = { title: '노트' };

export default async function NotePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { actor } = await requireSession();
  // 휴지통의 노트도 열어서 복구할 수 있게 한다
  const note = await getNote(db, actor, id, { includeDeleted: true }).catch((e) => {
    if (e instanceof NotFoundError) notFound();
    throw e;
  });
  const projects = await listProjects(db, actor, { workspaceId: note.workspaceId });
  return (
    <NoteEditor
      key={note.updatedAt.toISOString()}
      note={note}
      projects={projects.map((p) => ({ id: p.id, name: p.name }))}
    />
  );
}
