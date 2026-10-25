'use server';

import {
  saveFinanceAccount,
  archiveFinanceAccount,
  saveFinanceEntry,
  setFinanceEntryDeleted,
  saveFinanceBudget,
  deleteFinanceBudget,
} from '@myos/domain';
import { db } from '../db';
import { runAction } from '../action';
const paths = ['/finance'];
export async function saveFinanceAccountAction(input: unknown, id?: string) {
  return runAction(({ actor }) => saveFinanceAccount(db, actor, input, id), paths);
}
export async function archiveFinanceAccountAction(id: string, archived: boolean) {
  return runAction(({ actor }) => archiveFinanceAccount(db, actor, id, archived), paths);
}
export async function saveFinanceEntryAction(input: unknown, id: string, editing: boolean) {
  return runAction(({ actor }) => saveFinanceEntry(db, actor, input, id, editing), paths);
}
export async function setFinanceEntryDeletedAction(id: string, deleted: boolean) {
  return runAction(({ actor }) => setFinanceEntryDeleted(db, actor, id, deleted), paths);
}
export async function saveFinanceBudgetAction(input: unknown) {
  return runAction(({ actor }) => saveFinanceBudget(db, actor, input), paths);
}
export async function deleteFinanceBudgetAction(id: string) {
  return runAction(({ actor }) => deleteFinanceBudget(db, actor, id), paths);
}
