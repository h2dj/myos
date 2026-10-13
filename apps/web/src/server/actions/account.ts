'use server';

import { markAllNotificationsRead, markNotificationRead, updateProfile } from '@myos/domain';
import { db } from '../db';
import { runAction, str } from '../action';

export async function updateProfileAction(form: FormData) {
  return runAction(
    async ({ actor }) => {
      await updateProfile(db, actor, {
        name: str(form, 'name') ?? '',
        timezone: str(form, 'timezone') ?? '',
        notifyEmail: form.get('notifyEmail') === 'on',
      });
    },
    ['/settings', '/dashboard'],
  );
}

export async function markNotificationReadAction(id: string) {
  return runAction(async ({ actor }) => markNotificationRead(db, actor, id), ['/notifications']);
}

export async function markAllNotificationsReadAction() {
  return runAction(async ({ actor }) => markAllNotificationsRead(db, actor), ['/notifications']);
}
