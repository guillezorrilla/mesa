import type { Gate, Question } from '@mesa/core';
import { GateOptions } from '@/features/tasks/GateOptions';
import type { CrewCard } from './crewPlan';
import { WorkerQuestionField } from './WorkerQuestionField';

/**
 * What waits on the person, first on the Crew panel: each open decision gate on the crew's tasks
 * (its question, the task it unblocks by number and title, one button per option) and each open
 * question a worker asked (its question, the worker's card, and a reply box).
 */
export function CrewChoices(props: {
  gates: readonly Pick<Gate, 'id' | 'task' | 'question' | 'options'>[];
  questions: readonly Question[];
  cards: readonly CrewCard[];
  /** A gate was resolved, or refused with why: read the plan again. */
  onGateDone: (refused?: string) => Promise<unknown>;
  onAnswered: (question: string) => void;
}) {
  const { cards } = props;
  if (!props.gates.length && !props.questions.length) return null;
  const card = (match: (each: CrewCard) => boolean) => {
    const at = cards.findIndex(match);
    return at < 0 ? undefined : { number: at + 1, title: cards[at]?.title };
  };
  return (
    <section
      aria-label="Your choice"
      data-testid="crew-choices"
      className="mx-2 mt-2 grid gap-3 rounded-lg border border-state-waiting bg-state-waiting/10 p-3"
    >
      <span className="text-xs font-medium text-state-waiting">Your choice</span>
      {props.gates.map((gate) => {
        const task = card((each) => each.task?.id === gate.task);
        return (
          <div key={gate.id} data-testid="crew-gate" className="grid gap-2">
            <p className="text-sm font-medium">{gate.question}</p>
            {task && (
              <p className="text-xs text-muted-foreground">
                Task {task.number}, {task.title}, starts once you pick.
              </p>
            )}
            <GateOptions gate={gate} onDone={props.onGateDone} />
          </div>
        );
      })}
      {props.questions.map((question) => {
        const asker = card((each) => each.worker?.id === question.child);
        return (
          <div key={question.id} data-testid="crew-question" className="grid gap-2">
            <p className="whitespace-pre-wrap text-sm font-medium">{question.text}</p>
            <p className="text-xs text-muted-foreground">
              {asker
                ? `Task ${asker.number}, ${asker.title}, asks.`
                : `${question.childName} asks.`}
            </p>
            <WorkerQuestionField
              question={question.id}
              label={`Answer ${asker?.title ?? question.childName}`}
              onAnswered={() => props.onAnswered(question.id)}
            />
          </div>
        );
      })}
    </section>
  );
}
