import { Archive, Check, Sparkles } from 'lucide-react';
import { useRef, useState } from 'react';
import { ActionDialog } from '@/components/ActionDialog';
import { IconButton } from '@/components/IconButton';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';

/**
 * The commit message, Generate (an agent writes it from what is staged), and Commit; the message
 * clears once a commit lands. A generated message fills an empty box, and replaces a typed one
 * only once confirmed.
 */
export function GitCommitBox(props: {
  canCommit: boolean;
  acting: boolean;
  stashesOpen: boolean;
  onToggleStashes: () => void;
  /** Resolves true when the commit landed. */
  onCommit: (message: string) => Promise<boolean>;
  /** Resolves the generated message, or undefined when the run failed (its toast says why). */
  onGenerate: () => Promise<string | undefined>;
}) {
  const [message, setMessageState] = useState('');
  // What the box holds now, read when a generated message lands after the person typed meanwhile.
  const typed = useRef('');
  const setMessage = (text: string) => {
    typed.current = text;
    setMessageState(text);
  };
  const [generating, setGenerating] = useState(false);
  const [replacing, setReplacing] = useState<string>();
  const generate = async () => {
    setGenerating(true);
    try {
      const written = await props.onGenerate();
      if (written === undefined) return;
      if (typed.current.trim()) setReplacing(written);
      else setMessage(written);
    } finally {
      setGenerating(false);
    }
  };
  return (
    <>
      <form
        className="space-y-3 border-t p-3"
        onSubmit={(event) => {
          event.preventDefault();
          void props.onCommit(message).then((done) => done && setMessage(''));
        }}
      >
        <Textarea
          aria-label="Commit message"
          rows={3}
          className="resize-none bg-background dark:bg-background"
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          placeholder="Commit message..."
        />
        <div className="flex gap-2">
          <Button
            type="submit"
            variant="secondary"
            className="flex-1"
            disabled={props.acting || generating || !props.canCommit || !message.trim()}
          >
            <Check aria-hidden /> Commit
          </Button>
          <IconButton
            label="Generate commit message"
            icon={Sparkles}
            size="icon"
            aria-busy={generating}
            className={generating ? '[&_svg]:animate-spin' : undefined}
            disabled={generating || props.acting || !props.canCommit}
            onClick={() => void generate()}
          />
          <IconButton
            label="Stashes"
            icon={Archive}
            size="icon"
            active={props.stashesOpen}
            onClick={props.onToggleStashes}
          />
        </div>
      </form>
      {/* Outside the form: a submit inside the dialog must never reach Commit. */}
      {replacing !== undefined && (
        <ActionDialog
          testId="replace-commit-message"
          title="Replace your commit message?"
          description="The agent wrote a new message. Replacing loses the one you typed."
          submit={{ label: 'Replace', testId: 'replace-commit-message-submit', disabled: false }}
          onSubmit={() => {
            setMessage(replacing);
            setReplacing(undefined);
          }}
          onCancel={() => setReplacing(undefined)}
        />
      )}
    </>
  );
}
