import CheckCheck from 'lucide-react-native/icons/check-check';
import { Suspense } from 'react';
import { BusyScreen } from '@/components/BusyScreen';
import { HeaderButton } from '@/components/HeaderButton';
import { TabHeader } from '@/components/TabHeader';
import { InboxList } from './InboxList';
import { useInbox } from './useInbox';

/**
 * The Inbox tab: the Mac's notices, newest first, each opening the session or item it names, and
 * Mark all read in its header.
 */
export function InboxScreen() {
  const inbox = useInbox();
  const header = (
    <TabHeader title="Inbox">
      <HeaderButton icon={CheckCheck} label="Mark all read" onPress={inbox.markAll} />
    </TabHeader>
  );
  return (
    <Suspense fallback={<BusyScreen label="Asking your Mac..." header={header} />}>
      <InboxList
        answer={inbox.answer}
        header={header}
        refreshing={inbox.refreshing}
        onRefresh={inbox.pull}
        onOpen={inbox.open}
        onMarkRead={inbox.markRead}
      />
    </Suspense>
  );
}
