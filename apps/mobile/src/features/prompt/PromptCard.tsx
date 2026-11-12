import { AnswerNote } from './AnswerNote';
import { PromptRead } from './PromptRead';
import { noteShown } from './promptText';
import { useAnswer } from './useAnswer';

/**
 * A session's pending prompt while it waits, answered from the phone, and how the last answer
 * went; the note outlives the prompt, so a stale answer is still told after the session moved on.
 */
export function PromptCard({
  id,
  waiting,
  since,
}: {
  id: string;
  waiting: boolean;
  since: string;
}) {
  const { last, round, busy, answer } = useAnswer(id, since);
  return (
    <>
      {/* Read again for each new prompt, whose hook moves the state's time, and after a stale one. */}
      {waiting ? (
        <PromptRead
          key={`${since}:${round}`}
          id={id}
          answered={last?.outcome.kind === 'answered' && last.at === since}
          busy={busy}
          onAnswer={answer}
        />
      ) : null}
      {last && !busy && noteShown(last, waiting, since) ? (
        <AnswerNote outcome={last.outcome} />
      ) : null}
    </>
  );
}
