import { Copy } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { ActionDialog } from '@/components/ActionDialog';
import { IconButton } from '@/components/IconButton';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { usePlatform } from '@/lib/MesaRoot';
import { useRun } from '@/lib/useCommand';

/**
 * A pull request's title and body for the checkout's branch, drafted by an agent when it opens
 * (`mesa git pr-text`): both editable, each with Copy, and Regenerate. Mesa opens nothing.
 */
export function PullRequestTextDialog(props: {
  project: string;
  checkout?: string;
  onClose: () => void;
}) {
  const run = useRun();
  const { clipboard } = usePlatform();
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [writing, setWriting] = useState(false);
  const generate = useRef(async () => {});
  generate.current = async () => {
    setWriting(true);
    try {
      const text = await run('git.prText', { project: props.project, checkout: props.checkout });
      if (!text) return;
      setTitle(text.title);
      setBody(text.body);
    } finally {
      setWriting(false);
    }
  };
  // Once per opening: StrictMode's second mount must not start a second agent run.
  const started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void generate.current();
  }, []);
  const copy = (label: string, text: string) => (
    <IconButton
      label={`Copy ${label}`}
      icon={Copy}
      disabled={!text}
      onClick={() => void clipboard.write(text)}
    />
  );
  return (
    <ActionDialog
      testId="pr-text-dialog"
      wide
      title="Pull request text"
      description={
        writing
          ? 'An agent is writing the title and body from this branch...'
          : 'Written by an agent from this branch. Edit it, then copy it where you open the pull request.'
      }
      submit={{ label: 'Regenerate', testId: 'pr-text-regenerate', disabled: writing }}
      onSubmit={() => void generate.current()}
      onCancel={props.onClose}
    >
      <div className="grid gap-1.5">
        <Label htmlFor="pr-text-title">Title</Label>
        <div className="flex gap-2">
          <Input
            id="pr-text-title"
            value={title}
            disabled={writing}
            onChange={(event) => setTitle(event.currentTarget.value)}
          />
          {copy('title', title)}
        </div>
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="pr-text-body">Body</Label>
        <div className="flex items-start gap-2">
          <Textarea
            id="pr-text-body"
            rows={10}
            className="font-mono text-xs"
            value={body}
            disabled={writing}
            onChange={(event) => setBody(event.currentTarget.value)}
          />
          {copy('body', body)}
        </div>
      </div>
    </ActionDialog>
  );
}
