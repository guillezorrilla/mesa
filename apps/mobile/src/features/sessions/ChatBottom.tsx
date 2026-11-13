import type { PhoneDetail } from '@mesa/core/phone';
import { View } from 'react-native';
import { PromptCard } from '../prompt/PromptCard';
import { LiveLine } from '../steps/LiveLine';
import type { Live } from '../steps/liveOf';
import { QueuedList } from './QueuedList';
import { groupOf } from './sessionState';

/**
 * The bottom of a session's conversation, just above the reply bar: while it works, its live line
 * (`live`); replies waiting for its turn; the prompt it waits on.
 */
export function ChatBottom({
  detail,
  live,
  onChange,
}: {
  detail: PhoneDetail;
  live?: Live;
  onChange: () => void;
}) {
  const { row } = detail;
  return (
    <View className="gap-4 px-4 pt-4 pb-3">
      {live ? <LiveLine step={live.step} /> : null}
      {detail.queued.length ? (
        <QueuedList id={row.id} queued={detail.queued} onChange={onChange} />
      ) : null}
      <PromptCard id={row.id} waiting={groupOf(row.state) === 'needs-you'} since={row.since} />
    </View>
  );
}
