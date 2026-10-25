'use server';
import { saveFinancePlan, pauseFinancePlan, postFinancePlan, skipFinancePlan } from '@myos/domain';
import { db } from '../db';
import { runAction } from '../action';
const paths = ['/finance'];
export async function saveFinancePlanAction(input: unknown, id: string, editing: boolean) {
  return runAction(({ actor }) => saveFinancePlan(db, actor, input, id, editing), paths);
}
export async function pauseFinancePlanAction(id: string, paused: boolean) {
  return runAction(({ actor }) => pauseFinancePlan(db, actor, id, paused), paths);
}
export async function postFinancePlanAction(id: string, on: string, input: unknown) {
  return runAction(({ actor }) => postFinancePlan(db, actor, id, on, input), paths);
}
export async function skipFinancePlanAction(id: string, on: string, skipped: boolean) {
  return runAction(({ actor }) => skipFinancePlan(db, actor, id, on, skipped), paths);
}
