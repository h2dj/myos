'use server';

import {
  importNotionSample,
  inspectNotionFile,
  previewNotionImport,
  requireAccess,
  type NotionRequest,
} from '@myos/domain';
import { db } from '../db';
import { runAction } from '../action';

export async function inspectNotionAction(text: string, format: 'csv' | 'json') {
  return runAction(async ({ actor, workspace }) => {
    await requireAccess(db, actor, workspace.id, 'manage');
    return inspectNotionFile(text, format);
  });
}
export async function previewNotionAction(input: NotionRequest) {
  return runAction(({ actor, workspace, user }) =>
    previewNotionImport(db, actor, workspace.id, input, user.timezone),
  );
}
export async function importNotionAction(input: NotionRequest, digest: string, selected: number[]) {
  return runAction(
    ({ actor, workspace, user }) =>
      importNotionSample(db, actor, workspace.id, input, user.timezone, { digest, selected }),
    ['/tasks', '/projects', '/activities', '/dashboard', '/search', '/settings'],
  );
}
