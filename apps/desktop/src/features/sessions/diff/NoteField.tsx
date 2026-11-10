import { useState } from 'react';
import { Kbd } from '@/components/Kbd';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';

/** Where a note is written: Cmd-Enter saves, Esc cancels; a blank note cannot be saved. */
export function NoteField(props: {
  /** What it is on: `Line 3`, `Lines 3-5`, `File`. */
  label: string;
  initial?: string;
  busy: boolean;
  onSave: (text: string) => void;
  onCancel: () => void;
}) {
  const [text, setText] = useState(props.initial ?? '');
  const save = () => {
    if (text.trim()) props.onSave(text);
  };
  return (
    <div className="my-1.5 space-y-2 rounded-md border bg-background p-2 font-sans shadow-xs">
      <Textarea
        autoFocus
        aria-label={`Note on ${props.label.toLowerCase()}`}
        placeholder="Note for the agent"
        value={text}
        className="max-h-60 min-h-14 text-sm"
        onChange={(event) => setText(event.target.value)}
        onKeyDown={(event) => {
          // The diff's own keys (j, k, Escape) stay out of a note being written.
          event.stopPropagation();
          if (event.key === 'Enter' && event.metaKey) save();
          if (event.key === 'Escape') props.onCancel();
        }}
      />
      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground">{props.label}</span>
        <span className="ml-auto" />
        <Button size="xs" variant="ghost" onClick={props.onCancel}>
          Cancel
        </Button>
        <Button size="xs" disabled={props.busy || !text.trim()} onClick={save}>
          Save <Kbd>⌘↵</Kbd>
        </Button>
      </div>
    </div>
  );
}
