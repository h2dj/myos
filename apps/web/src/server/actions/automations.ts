'use server';

import { retryRunNow, runAutomationNow, updateAutomation } from '@myos/domain';
import { db } from '../db';
import { engineDeps } from '../engine';
import { runAction } from '../action';

const PATHS = ['/automations', '/dashboard', '/notifications', '/tasks', '/knowledge'];

export async function updateAutomationAction(
  id: string,
  input: { enabled?: boolean; config?: Record<string, unknown> },
) {
  return runAction(async ({ actor }) => {
    await updateAutomation(db, actor, id, input);
  }, PATHS);
}

export async function runAutomationNowAction(id: string) {
  return runAction(async ({ actor }) => {
    const res = await runAutomationNow(db, actor, id, engineDeps());
    return { status: res.status, error: res.error };
  }, PATHS);
}

export async function retryRunAction(runId: string) {
  return runAction(async ({ actor }) => {
    const res = await retryRunNow(db, actor, runId, engineDeps());
    return { status: res.status, error: res.error };
  }, PATHS);
}
