import type { CallResult, NoteDelivery } from '@mesa/core/phone';
import { use } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { ErrorNote } from '@/components/ErrorNote';
import { KeyboardScreen } from '@/components/KeyboardScreen';
import { Text } from '@/components/ui/text';
import { isSelected, type LineSelection } from '@/lib/lineSelection';
import { cn } from '@/lib/utils';
import { CommentForm } from '../changes/CommentForm';
import type { MacRead } from '../mac/tryCall';
import { quoteLabel } from './quoteLabel';
import { passageOf, type ReplyLine, replyLines } from './replyLines';

/** One reply's lines to tap, and a comment on the tapped passage sent to the agent. */
export function QuoteBody({
  reply,
  answer,
  selection,
  onTap,
  onQuote,
}: {
  /** The reply's revision. */
  reply: string;
  answer: Promise<MacRead<CallResult<'session'>>>;
  selection?: LineSelection;
  onTap: (lines: readonly ReplyLine[], at: number) => void;
  onQuote: (passage: string, comment: string) => Promise<MacRead<NoteDelivery>>;
}) {
  const { result, error } = use(answer);
  const found = result?.replies.find((r) => r.id === reply);
  if (!found)
    return (
      <View className="flex-1 bg-background p-4">
        <ErrorNote text={error ?? 'That reply is no longer among the latest; read it again.'} />
      </View>
    );
  const lines = replyLines(found.segments);
  const passage = selection ? passageOf(lines, selection) : '';
  return (
    <KeyboardScreen
      bar={
        passage.trim() ? (
          <CommentForm
            label={quoteLabel(passage.split('\n').length)}
            send={(comment) => onQuote(passage, comment)}
          />
        ) : null
      }
    >
      <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerClassName="py-4">
        <Text variant="muted" className="px-4 pb-2">
          Tap a line, then another, to quote them to the agent.
        </Text>
        {lines.map((line, at) => (
          <Pressable
            // biome-ignore lint/suspicious/noArrayIndexKey: a reply's lines are a fixed cut of its text.
            key={at}
            accessibilityState={{ selected: isSelected(selection, at) }}
            onPress={() => onTap(lines, at)}
            className={cn(
              'px-4 py-0.5',
              line.code && 'bg-muted',
              isSelected(selection, at) && 'bg-ring/25',
            )}
          >
            <Text className={cn(line.code && 'font-mono text-sm')}>{line.text || ' '}</Text>
          </Pressable>
        ))}
      </ScrollView>
    </KeyboardScreen>
  );
}
