import { Send } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useCommand, useRun } from '@/lib/useCommand';

/**
 * The open questions a session's workers asked it (`mesa report question`), each with a reply
 * box; Send answers through `mesa reports reply`, and the question leaves the list.
 */
export function WorkerQuestionsPanel(props: { session: string }) {
  const run = useRun();
  const read = useCommand('reports.questions', { session: props.session });
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [sending, setSending] = useState<string>();
  const questions = read.data?.questions;
  if (!questions) return <>{read.error ? 'Could not read them' : 'Reading'}</>;
  if (!questions.length) return <>None open</>;
  const reply = async (id: string) => {
    setSending(id);
    const done = await run('reports.reply', { question: id, answer: answers[id] ?? '' });
    setSending(undefined);
    if (done)
      read.mutate((list) => ({ ...list, questions: list.questions.filter((q) => q.id !== id) }));
  };
  return (
    <ul data-testid="session-worker-questions" className="grid gap-2">
      {questions.map((q) => (
        <li key={q.id} className="grid gap-1">
          <span>
            <span className="font-medium">{q.childName}</span>{' '}
            <span className="font-mono text-muted-foreground">{q.id}</span>
          </span>
          <span className="whitespace-pre-wrap">{q.text}</span>
          <form
            className="flex gap-1"
            onSubmit={(event) => {
              event.preventDefault();
              void reply(q.id);
            }}
          >
            <Input
              aria-label={`Answer ${q.id}`}
              value={answers[q.id] ?? ''}
              onChange={(event) => setAnswers((all) => ({ ...all, [q.id]: event.target.value }))}
            />
            <Button type="submit" size="sm" disabled={sending === q.id || !answers[q.id]?.trim()}>
              <Send aria-hidden /> Send
            </Button>
          </form>
        </li>
      ))}
    </ul>
  );
}
