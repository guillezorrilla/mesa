import { Send } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useRun } from '@/lib/useCommand';

/**
 * The reply box to one open question a worker asked its parent (`mesa report question`): Send
 * answers it through `mesa reports reply`, then `onAnswered` drops it from the caller's list.
 */
export function WorkerQuestionField(props: { question: string; onAnswered: () => void }) {
  const run = useRun();
  const [answer, setAnswer] = useState('');
  const [sending, setSending] = useState(false);
  const reply = async () => {
    setSending(true);
    const done = await run('reports.reply', { question: props.question, answer });
    setSending(false);
    if (done) props.onAnswered();
  };
  return (
    <form
      className="flex gap-1"
      onSubmit={(event) => {
        event.preventDefault();
        void reply();
      }}
    >
      <Input
        aria-label={`Answer ${props.question}`}
        value={answer}
        onChange={(event) => setAnswer(event.target.value)}
      />
      <Button type="submit" size="sm" disabled={sending || !answer.trim()}>
        <Send aria-hidden /> Send
      </Button>
    </form>
  );
}
