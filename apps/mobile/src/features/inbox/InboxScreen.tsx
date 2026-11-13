import { Suspense } from 'react';
import { BusyScreen } from '@/components/BusyScreen';
import { InboxList } from './InboxList';
import { useInbox } from './useInbox';

/** The Inbox tab: the Mac's notices, newest first, each opening the session or item it names. */
export function InboxScreen() {
  const inbox = useInbox();
  return (
    <Suspense fallback={<BusyScreen label="Asking your Mac..." />}>
      <InboxList
        answer={inbox.answer}
        refreshing={inbox.refreshing}
        onRefresh={inbox.pull}
        onOpen={inbox.open}
        onMarkRead={inbox.markRead}
      />
    </Suspense>
  );
}
