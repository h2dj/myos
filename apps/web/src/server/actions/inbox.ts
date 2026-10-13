'use server';

import {
  archiveInbox,
  captureInbox,
  convertInboxToNote,
  convertInboxToTask,
  reopenInbox,
} from '@myos/domain';
import { db } from '../db';
import { runAction } from '../action';

const PATHS = ['/inbox', '/dashboard', '/tasks', '/knowledge'];

export async function captureInboxAction(content: string, source: 'quick_input' | 'dashboard') {
  return runAction(async ({ actor, workspace }) => {
    const item = await captureInbox(db, actor, { workspaceId: workspace.id, content, source });
    return { id: item.id };
  }, PATHS);
}

export async function convertInboxAction(itemId: string, to: 'task' | 'note' | 'idea') {
  return runAction(async ({ actor }) => {
    if (to === 'task') await convertInboxToTask(db, actor, itemId);
    else await convertInboxToNote(db, actor, itemId, { type: to });
  }, PATHS);
}

export async function archiveInboxAction(itemId: string) {
  return runAction(async ({ actor }) => archiveInbox(db, actor, itemId), PATHS);
}

export async function reopenInboxAction(itemId: string) {
  return runAction(async ({ actor }) => reopenInbox(db, actor, itemId), PATHS);
}
