import { type PhonePrompt, promptTitle } from '@mesa/core/phone';
import { use } from 'react';
import { BusyLine } from '@/components/BusyLine';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Text } from '@/components/ui/text';
import { cn } from '@/lib/utils';
import { AnswerNote } from './AnswerNote';
import { PromptOptions } from './PromptOptions';
import { PromptTextField } from './PromptTextField';
import { type AnswerOutcome, UNSUPPORTED_TEXT } from './promptText';
import type { Choice } from './usePrompt';

/**
 * The prompt card: what the agent asks and its input, its options and a typed answer where it
 * takes one; for a prompt Mesa cannot answer here, that it waits at the Mac.
 */
export function PromptBody({
  read,
  outcome,
  answering,
  onAnswer,
}: {
  read: Promise<PhonePrompt | undefined>;
  outcome?: AnswerOutcome;
  answering: boolean;
  onAnswer: (choice: Choice) => void;
}) {
  const prompt = use(read);
  const note = outcome ? <AnswerNote outcome={outcome} /> : null;
  if (prompt?.status !== 'pending') {
    if (!prompt) return note;
    return (
      <Card className="gap-2 py-4">
        <CardContent className="px-4">
          <Text>{UNSUPPORTED_TEXT}</Text>
        </CardContent>
      </Card>
    );
  }
  const answered = Boolean(outcome && 'answered' in outcome);
  const disabled = answering || answered;
  return (
    <Card className="gap-4 py-4">
      <CardHeader className="gap-2 px-4">
        <CardTitle>{promptTitle(prompt)}</CardTitle>
        <Text selectable className={cn(prompt.kind === 'permission' && 'font-mono text-sm')}>
          {prompt.summary}
        </Text>
      </CardHeader>
      <CardContent className="gap-3 px-4">
        {answered ? null : (
          <PromptOptions
            options={prompt.options}
            disabled={disabled}
            onChoose={(option) => onAnswer({ option })}
          />
        )}
        {prompt.freeText && !answered ? (
          <PromptTextField disabled={disabled} onSubmit={(text) => onAnswer({ text })} />
        ) : null}
        {answering ? <BusyLine label="Answering..." /> : note}
      </CardContent>
    </Card>
  );
}
