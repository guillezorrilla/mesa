import { useCommand } from '@/lib/useCommand';
import { WorkerQuestionField } from './WorkerQuestionField';

/**
 * The open questions a session's workers asked it (`mesa report question`), each with a reply
 * box (WorkerQuestionField); an answered question leaves the list.
 */
export function WorkerQuestionsPanel(props: { session: string }) {
  const read = useCommand('reports.questions', { session: props.session });
  const questions = read.data?.questions;
  if (!questions) return <>{read.error ? 'Could not read them' : 'Reading'}</>;
  if (!questions.length) return <>None open</>;
  return (
    <ul data-testid="session-worker-questions" className="grid gap-2">
      {questions.map((q) => (
        <li key={q.id} className="grid gap-1">
          <span>
            <span className="font-medium">{q.childName}</span>{' '}
            <span className="font-mono text-muted-foreground">{q.id}</span>
          </span>
          <span className="whitespace-pre-wrap">{q.text}</span>
          <WorkerQuestionField
            question={q.id}
            onAnswered={() =>
              read.mutate((list) => ({
                ...list,
                questions: list.questions.filter((each) => each.id !== q.id),
              }))
            }
          />
        </li>
      ))}
    </ul>
  );
}
