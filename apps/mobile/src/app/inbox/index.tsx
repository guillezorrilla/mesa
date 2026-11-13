import { TabScreen } from '@/components/TabScreen';
import { InboxScreen } from '@/features/inbox/InboxScreen';

export default function Inbox() {
  return (
    <TabScreen>
      <InboxScreen />
    </TabScreen>
  );
}
