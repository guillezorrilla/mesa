import { useEffect, useState } from 'react';
import { Input } from '@/components/ui/input';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { useSettings } from './useSettings';

/** A switch saved to `path` as soon as it flips. */
export function Toggle(props: { id: string; path: string; checked: boolean }) {
  const { acting, save } = useSettings();
  return (
    <Switch
      id={props.id}
      checked={props.checked}
      disabled={acting}
      onCheckedChange={(checked) => save(props.path, checked)}
    />
  );
}

/** A select saved to `path` on change; `toValue` turns the option into the stored value. */
export function Choice<T extends string>(props: {
  id: string;
  path: string;
  value: T;
  options: readonly (readonly [T, string])[];
  toValue?: (option: T) => unknown;
}) {
  const { acting, save } = useSettings();
  return (
    <NativeSelect
      id={props.id}
      className="min-w-40"
      value={props.value}
      disabled={acting}
      onChange={(event) => {
        const option = event.currentTarget.value as T;
        save(props.path, props.toValue ? props.toValue(option) : option);
      }}
    >
      {props.options.map(([value, text]) => (
        <NativeSelectOption key={value} value={value}>
          {text}
        </NativeSelectOption>
      ))}
    </NativeSelect>
  );
}

/** A slider that follows the drag and saves once, where it is released. */
export function Range(props: {
  id: string;
  path: string;
  value: number;
  min: number;
  max: number;
}) {
  const { acting, save } = useSettings();
  const [draft, setDraft] = useState(props.value);
  useEffect(() => setDraft(props.value), [props.value]);
  const release = () => {
    if (draft !== props.value) save(props.path, draft);
  };
  return (
    <span className="flex items-center gap-2 text-xs text-muted-foreground">
      {props.min}
      <input
        id={props.id}
        type="range"
        className="w-32 accent-state-working"
        min={props.min}
        max={props.max}
        value={draft}
        aria-valuetext={String(draft)}
        disabled={acting}
        onChange={(event) => setDraft(Number(event.currentTarget.value))}
        onPointerUp={release}
        onKeyUp={release}
      />
      {props.max}
      <span className="w-6 text-right text-foreground">{draft}</span>
    </span>
  );
}

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

/** Comma-separated words, kept in order, blanks dropped. */
export const commaList = (text: string) => ({
  value: text
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean),
});

/** One entry per line, blanks dropped. */
export const lineList = (text: string) => ({
  value: text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean),
});
