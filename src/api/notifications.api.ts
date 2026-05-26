import * as dv from '../lib/dataverseClient';
import { ENTITY_SETS } from '../lib/constants';
import type { Notification, NotificationCreate } from '../models/notification.model';

const SET = ENTITY_SETS.notification;
const FIELDS: (keyof Notification)[] = [
  'pmo_notificationid', 'pmo_title', 'pmo_body', 'pmo_category',
  'pmo_isread', 'pmo_actionurl', 'statecode', 'createdon',
  '_pmo_targetuser_value', '_pmo_project_value', '_pmo_program_value',
];

export async function listNotifications(userId: string): Promise<Notification[]> {
  return dv.list<Notification>(SET, {
    $select: FIELDS,
    $filter: `_pmo_targetuser_value eq '${userId}' and statecode eq 0`,
    $orderby: 'createdon desc',
    $top: 50,
  });
}

export async function createNotification(payload: NotificationCreate): Promise<Notification> {
  return dv.create<Notification>(SET, payload);
}

export async function markAsRead(id: string): Promise<void> {
  return dv.update(SET, id, { pmo_isread: true });
}

export async function dismissNotification(id: string): Promise<void> {
  return dv.deactivate(SET, id);
}
