import { useEffect, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useSettings } from '../useSettings';

/**
 * Text saved when it changes and the field is left or Enter is pressed; `parse` turns it into the
 * stored value and says why it cannot be one.
 */
export function TextField(props: {
  id: string;
  value: string;
  placeholder?: string;
  className?: string;
  /** One entry per line; Enter adds a line instead of saving. */
  multiline?: boolean;
  parse?: (text: string) => { value: unknown } | { error: string };
  onSave: (value: unknown) => void;
}) {
  const { acting } = useSettings();
  const [draft, setDraft] = useState(props.value);
  const [error, setError] = useState('');
  useEffect(() => {
    setDraft(props.value);
    setError('');
  }, [props.value]);
  const commit = () => {
    if (draft === props.value) return;
    const parsed = props.parse ? props.parse(draft) : { value: draft };
    if ('error' in parsed) setError(parsed.error);
    else props.onSave(parsed.value);
  };
  const field = {
    id: props.id,
    value: draft,
    placeholder: props.placeholder,
    disabled: acting,
    'aria-invalid': Boolean(error),
    onBlur: commit,
  };
  return (
    <span className="block">
      {props.multiline ? (
        <Textarea
          {...field}
          rows={3}
          className={props.className ?? 'w-full font-mono text-xs'}
          onChange={(event) => {
            setDraft(event.currentTarget.value);
            setError('');
          }}
        />
      ) : (
        <Input
          {...field}
          className={props.className ?? 'w-64 font-mono text-xs'}
          onChange={(event) => {
            setDraft(event.currentTarget.value);
            setError('');
          }}
          onKeyDown={(event) => event.key === 'Enter' && commit()}
        />
      )}
      {error && (
        <span role="alert" className="mt-1 block text-xs text-destructive">
          {error}
        </span>
      )}
    </span>
  );
}
