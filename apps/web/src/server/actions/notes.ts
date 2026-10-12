'use server';

import {
  createNote,
  createTaskFromNote,
  deleteNote,
  restoreNote,
  updateNote,
  type NoteType,
} from '@myos/domain';
import { db } from '../db';
import { runAction, str, tagList } from '../action';

const PATHS = ['/knowledge', '/projects', '/tasks'];

function fields(form: FormData) {
  return {
    title: str(form, 'title') ?? '',
    content: (form.get('content') as string | null) ?? '',
    type: (str(form, 'type') ?? 'note') as NoteType,
    projectId: str(form, 'projectId') ?? null,
    tags: tagList(form) ?? [],
  };
}

export async function createNoteAction(form: FormData) {
  return runAction(async ({ actor, workspace }) => {
    const note = await createNote(db, actor, { workspaceId: workspace.id, ...fields(form) });
    return { id: note.id };
  }, PATHS);
}

export async function updateNoteAction(noteId: string, form: FormData) {
  return runAction(async ({ actor }) => {
    await updateNote(db, actor, noteId, fields(form));
  }, PATHS);
}

export async function toggleFavoriteAction(noteId: string, isFavorite: boolean) {
  return runAction(async ({ actor }) => {
    await updateNote(db, actor, noteId, { isFavorite });
  }, PATHS);
}

export async function deleteNoteAction(noteId: string) {
  return runAction(async ({ actor }) => deleteNote(db, actor, noteId), PATHS);
}

export async function restoreNoteAction(noteId: string) {
  return runAction(async ({ actor }) => {
    await restoreNote(db, actor, noteId);
  }, PATHS);
}

export async function createTaskFromNoteAction(noteId: string, title: string) {
  return runAction(async ({ actor }) => {
    const task = await createTaskFromNote(db, actor, noteId, { title });
    return { id: task.id };
  }, PATHS);
}
