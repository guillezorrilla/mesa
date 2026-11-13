import { FINAL_STATES, type PhoneRow } from '@mesa/core/phone';

/**
 * A session row's swipe and VoiceOver actions: Mark read or unread, and Archive for an ended
 * session (done, failed, stopped), which archiving does not stop, so it asks nothing first; a
 * live one is archived from the session menu, which confirms the stop.
 */
export const rowActions = (
  row: Pick<PhoneRow, 'state' | 'unread'>,
  on: { mark: (unread: boolean) => void; archive: () => void },
) => [
  {
    name: 'toggleUnread',
    label: row.unread ? 'Mark read' : 'Mark unread',
    run: () => on.mark(!row.unread),
  },
  ...((FINAL_STATES as ReadonlySet<string>).has(row.state)
    ? [{ name: 'archive', label: 'Archive', run: on.archive }]
    : []),
];
