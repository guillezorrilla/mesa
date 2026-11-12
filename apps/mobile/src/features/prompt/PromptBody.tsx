import { type PhonePrompt, promptTitle } from '@mesa/core/phone';
import { use } from 'react';
import { BusyLine } from '@/components/BusyLine';
import { CodeBlock } from '@/components/CodeBlock';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Text } from '@/components/ui/text';
import { AnswerNote } from './AnswerNote';
import { PromptHeading } from './PromptHeading';
import { PromptOptions } from './PromptOptions';
import { PromptTextField } from './PromptTextField';
import type { AnswerOutcome } from './promptText';
import { UnsupportedPromptCard } from './UnsupportedPromptCard';
import type { Choice } from './usePrompt';

/**
 * The prompt card: what the agent asks (a command as code), then its options and a typed answer
 * where it takes one, closed once answered; `busy` names the answer on its way.
 */
export function PromptBody({
  read,
  outcome,
  busy,
  onAnswer,
}: {
  read: Promise<PhonePrompt | undefined>;
  outcome?: AnswerOutcome;
  busy?: string;
  onAnswer: (choice: Choice) => void;
}) {
  const prompt = use(read);
  const note = outcome ? <AnswerNote outcome={outcome} /> : null;
  if (!prompt) return note;
  if (prompt.status === 'unsupported') return <UnsupportedPromptCard />;
  const open = outcome?.kind !== 'answered';
  return (
    <Card className="gap-4 border-state-waiting/50 py-4">
      <CardHeader className="gap-3 px-4">
        <PromptHeading title={promptTitle(prompt)} />
        {prompt.kind === 'permission' ? (
          <CodeBlock code={prompt.summary} />
        ) : (
          <Text selectable>{prompt.summary}</Text>
        )}
      </CardHeader>
      <CardContent className="gap-3 px-4">
        {open ? (
          <PromptOptions
            options={prompt.options}
            disabled={Boolean(busy)}
            onChoose={(option) => onAnswer({ option })}
          />
        ) : null}
        {open && prompt.freeText ? (
          <PromptTextField disabled={Boolean(busy)} onSubmit={(text) => onAnswer({ text })} />
        ) : null}
        {busy ? <BusyLine label={busy} /> : note}
      </CardContent>
    </Card>
  );
}
