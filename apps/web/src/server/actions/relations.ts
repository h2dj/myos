'use server';
import {
  addRelatedItem,
  getRelatedItems,
  removeRelatedItem,
  searchRelationTargets,
} from '@myos/domain';
import { runAction } from '../action';
import { db } from '../db';
const paths = ['/projects', '/activities', '/knowledge', '/tasks', '/search'];
export async function getRelatedItemsAction(source: unknown) {
  return runAction(({ actor }) => getRelatedItems(db, actor, source));
}
export async function searchRelationTargetsAction(source: unknown, input: unknown) {
  return runAction(({ actor }) => searchRelationTargets(db, actor, source, input));
}
export async function addRelatedItemAction(source: unknown, target: unknown) {
  return runAction(({ actor }) => addRelatedItem(db, actor, source, target), paths);
}
export async function removeRelatedItemAction(source: unknown, id: string) {
  return runAction(({ actor }) => removeRelatedItem(db, actor, source, id), paths);
}
