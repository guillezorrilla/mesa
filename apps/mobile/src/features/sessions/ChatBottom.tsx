import type { PhoneDetail, PhoneStep } from '@mesa/core/phone';
import { View } from 'react-native';
import { PromptCard } from '../prompt/PromptCard';
import { LiveLine } from '../steps/LiveLine';
import { QueuedList } from './QueuedList';
import { groupOf } from './sessionState';

/**
 * The bottom of a session's conversation, just above the reply bar: while it works, the step it is
 * on (`live`, none when the Mac names none); replies waiting for its turn; the prompt it waits on.
 */
export function ChatBottom({
  detail,
  live,
  onChange,
}: {
  detail: PhoneDetail;
  live?: PhoneStep;
  onChange: () => void;
}) {
  const { row } = detail;
  return (
    <View className="gap-4 px-4 pt-4 pb-3">
      {row.state === 'working' ? <LiveLine step={live} /> : null}
      {detail.queued.length ? (
        <QueuedList id={row.id} queued={detail.queued} onChange={onChange} />
      ) : null}
      <PromptCard id={row.id} waiting={groupOf(row.state) === 'needs-you'} since={row.since} />
    </View>
  );
}
