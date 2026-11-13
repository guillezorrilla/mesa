import type {
  DeliveryPlan,
  InboxItem,
  PrEventList,
  PrEventsDelivered,
  Question,
  ReportList,
  ReportsDelivered,
} from '@mesa/core';
import { command, commandWith } from './spec';

/** Notification commands: the inbox, its delivery, PR events, and child reports. */
export const notificationsCommands = {
  'notifications.list': command<InboxItem[]>('notifications'),
  'notifications.delivery': command<DeliveryPlan>('notifications', 'delivery'),
  'notifications.claimDelivery': command<DeliveryPlan>('notifications', 'delivery', '--claim'),
  'notifications.delivered': commandWith<{ ids: string[] }, { ids: string[]; delivered: true }>(
    ({ ids }) => ['notifications', 'delivered', '--', ids.join(',')],
  ),
  'notifications.read': commandWith<{ id: string }, { id: string; read: true }>(({ id }) => [
    'notifications',
    'read',
    '--',
    id,
  ]),
  'notifications.readAll': command<{ count: number }>('notifications', 'read', '--all'),
  'notifications.clear': commandWith<{ id: string }, { id: string; cleared: true }>(({ id }) => [
    'notifications',
    'clear',
    '--',
    id,
  ]),
  'notifications.clearAll': command<{ count: number }>('notifications', 'clear', '--all'),
  'prEvents.list': command<PrEventList>('pr-events'),
  'prEvents.deliver': command<PrEventsDelivered>('pr-events', '--deliver'),
  'reports.list': command<ReportList>('reports'),
  'reports.deliver': command<ReportsDelivered>('reports', '--deliver'),
  'reports.questions': commandWith<{ session: string }, ReportList>(({ session }) => [
    'reports',
    '--',
    session,
  ]),
  'reports.reply': commandWith<{ question: string; answer: string }, { question: Question }>(
    ({ question, answer }) => ['reports', 'reply', '--', question, answer],
  ),
};
