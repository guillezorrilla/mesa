import { Archive, Check } from 'lucide-react';
import { useState } from 'react';
import { IconButton } from '@/components/IconButton';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';

/** The commit message and its Commit button; the message clears once a commit lands. */
export function GitCommitBox(props: {
  canCommit: boolean;
  acting: boolean;
  stashesOpen: boolean;
  onToggleStashes: () => void;
  /** Resolves true when the commit landed. */
  onCommit: (message: string) => Promise<boolean>;
}) {
  const [message, setMessage] = useState('');
  return (
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
          disabled={props.acting || !props.canCommit || !message.trim()}
        >
          <Check aria-hidden /> Commit
        </Button>
        <IconButton
          label="Stashes"
          icon={Archive}
          size="icon"
          active={props.stashesOpen}
          onClick={props.onToggleStashes}
        />
      </div>
    </form>
  );
}
