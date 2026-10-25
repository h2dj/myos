'use server';

import { previewLifeBalance, saveLifeBalance, deleteLifeReview } from '@myos/domain';
import { runAction } from '../action';
import { db } from '../db';

export async function previewLifeBalanceAction(input: unknown) {
  return runAction(({ actor }) => previewLifeBalance(db, actor, input));
}
export async function saveLifeBalanceAction(input: unknown, requestId: string) {
  return runAction(({ actor }) => saveLifeBalance(db, actor, input, requestId), ['/life-balance']);
}
export async function deleteLifeReviewAction(id: string) {
  return runAction(({ actor }) => deleteLifeReview(db, actor, id), ['/life-balance']);
}
