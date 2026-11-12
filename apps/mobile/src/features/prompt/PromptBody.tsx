import { type PhonePrompt, promptTitle } from '@mesa/core/phone';
import { use } from 'react';
import { BusyLine } from '@/components/BusyLine';
import { CodeBlock } from '@/components/CodeBlock';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Text } from '@/components/ui/text';
import { PromptHeading } from './PromptHeading';
import { PromptOptions } from './PromptOptions';
import { PromptTextField } from './PromptTextField';
import { UnsupportedPromptCard } from './UnsupportedPromptCard';
import type { Choice } from './useAnswer';

/**
 * The prompt card: what the agent asks (a command as code), then its options and a typed answer
 * where it takes one, closed once answered; `busy` names the answer on its way.
 */
export function PromptBody({
  read,
  answered,
  busy,
  onAnswer,
}: {
  read: Promise<PhonePrompt | undefined>;
  answered: boolean;
  busy?: string;
  onAnswer: (choice: Choice) => void;
}) {
  const prompt = use(read);
  if (!prompt) return null;
  if (prompt.status === 'unsupported') return <UnsupportedPromptCard />;
  const label = (option: string) => prompt.options.find((o) => o.id === option)?.label ?? option;
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
      {answered ? null : (
        <CardContent className="gap-3 px-4">
          <PromptOptions
            options={prompt.options}
            lead={prompt.kind === 'permission'}
            disabled={Boolean(busy)}
            onChoose={(option) => onAnswer({ option, prompt: prompt.id, label: label(option) })}
          />
          {prompt.freeText ? (
            <PromptTextField
              disabled={Boolean(busy)}
              onSubmit={(text) => onAnswer({ text, prompt: prompt.id, label: text })}
            />
          ) : null}
          {busy ? <BusyLine label={busy} /> : null}
        </CardContent>
      )}
    </Card>
  );
}
