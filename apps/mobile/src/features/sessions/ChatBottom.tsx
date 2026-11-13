import type { PhoneDetail } from '@mesa/core/phone';
import { View } from 'react-native';
import { PromptCard } from '../prompt/PromptCard';
import { OutputTail } from './OutputTail';
import { QueuedList } from './QueuedList';
import { groupOf } from './sessionState';

/**
 * The bottom of a session's conversation, just above the reply bar: replies waiting for its turn,
 * the prompt it waits on, and its output's last lines.
 */
export function ChatBottom({ detail, onChange }: { detail: PhoneDetail; onChange: () => void }) {
  const { row } = detail;
  return (
    <View className="gap-4 px-4 pt-4 pb-3">
      {detail.queued.length ? (
        <QueuedList id={row.id} queued={detail.queued} onChange={onChange} />
      ) : null}
      <PromptCard id={row.id} waiting={groupOf(row.state) === 'needs-you'} since={row.since} />
      <OutputTail lines={detail.tail} />
    </View>
  );
}
