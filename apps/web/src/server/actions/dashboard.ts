'use server';

import type { WidgetType } from '@myos/core';
import {
  addWidget,
  removeWidget,
  reorderWidgets,
  resetDashboard,
  updateDashboard,
  updateWidget,
} from '@myos/domain';
import { db } from '../db';
import { runAction } from '../action';

const PATHS = ['/dashboard'];

type DashboardInput = Parameters<typeof updateDashboard>[3];
type WidgetInput = Parameters<typeof updateWidget>[3];

export async function updateDashboardAction(dashboardId: string, input: DashboardInput) {
  return runAction(async ({ actor }) => {
    await updateDashboard(db, actor, dashboardId, input);
  }, PATHS);
}

export async function addWidgetAction(dashboardId: string, type: WidgetType) {
  return runAction(async ({ actor }) => {
    const w = await addWidget(db, actor, dashboardId, { type });
    return { id: w.id };
  }, PATHS);
}

export async function updateWidgetAction(widgetId: string, input: WidgetInput) {
  return runAction(async ({ actor }) => {
    await updateWidget(db, actor, widgetId, input);
  }, PATHS);
}

export async function removeWidgetAction(widgetId: string) {
  return runAction(async ({ actor }) => removeWidget(db, actor, widgetId), PATHS);
}

export async function reorderWidgetsAction(dashboardId: string, orderedIds: string[]) {
  return runAction(async ({ actor }) => reorderWidgets(db, actor, dashboardId, orderedIds), PATHS);
}

export async function resetDashboardAction(dashboardId: string) {
  return runAction(async ({ actor }) => resetDashboard(db, actor, dashboardId), PATHS);
}
