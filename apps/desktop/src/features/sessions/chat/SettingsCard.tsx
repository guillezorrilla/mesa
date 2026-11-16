import type { ChatMessage, UsageField, UsageForm } from '@mesa/core';
import { useEffect, useState } from 'react';
import { Muted } from '@/components/Muted';
import { SectionLabel } from '@/components/SectionLabel';
import { Input } from '@/components/ui/input';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { Switch } from '@/components/ui/switch';
import { useCall } from '@/lib/useCommand';
import { cn } from '@/lib/utils';

/** The form's groups, by the kind of value a key takes. */
const GROUPS: { kind: UsageField['kind']; title: string }[] = [
  { kind: 'boolean', title: 'On or off' },
  { kind: 'choice', title: 'Choices' },
  { kind: 'text', title: 'Values' },
];

/**
 * `/config`'s current values from where Claude Code keeps them, read again after each reply;
 * `at` is the reply count the values were read after.
 */
function useConfigValues(sessionId: string, form: UsageForm, replies: number) {
  const call = useCall();
  const [read, setRead] = useState<{ values: Record<string, string>; at: number }>({
    values: {},
    at: -1,
  });
  const keys = form.command === '/config' ? form.fields.map((f) => f.key) : [];
  const wanted = keys.join(' ');
  useEffect(() => {
    if (!wanted) return;
    let live = true;
    void call('sessions.config', { id: sessionId, keys: wanted.split(' ') }).then((r) => {
      if (live && r.ok) setRead({ values: r.data, at: replies });
    });
    return () => {
      live = false;
    };
  }, [call, sessionId, wanted, replies]);
  return read;
}

/**
 * One key's control: a switch, a select of the agent's values, or a field committed with Enter or
 * on leaving it. A key with no value read shows unset.
 */
function FieldControl(props: {
  field: UsageField;
  value?: string;
  disabled: boolean;
  onChange: (value: string) => void;
}) {
  const { field, value } = props;
  const id = `setting-${field.key}`;
  const label = (
    <label htmlFor={id} className="min-w-0 flex-1 truncate text-sm" title={field.key}>
      {field.key}
    </label>
  );
  if (field.kind === 'boolean')
    return (
      <div className="flex items-center gap-3 py-1">
        {label}
        <Switch
          id={id}
          data-card-control
          checked={value === 'true'}
          disabled={props.disabled}
          onCheckedChange={(on) => props.onChange(String(on))}
        />
      </div>
    );
  if (field.kind === 'choice') {
    const choices =
      value && !field.choices.includes(value) ? [value, ...field.choices] : field.choices;
    return (
      <div className="flex items-center gap-3 py-1">
        {label}
        <div className="w-44 shrink-0">
          <NativeSelect
            id={id}
            data-card-control
            size="sm"
            value={value ?? ''}
            disabled={props.disabled}
            onChange={(event) => props.onChange(event.target.value)}
          >
            {value === undefined && <NativeSelectOption value="">Not set</NativeSelectOption>}
            {choices.map((one) => (
              <NativeSelectOption key={one} value={one}>
                {one}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </div>
      </div>
    );
  }
  const commit = (input: HTMLInputElement) => {
    const next = input.value.trim();
    if (next && next !== (value ?? '')) props.onChange(next);
  };
  return (
    <div className="flex items-center gap-3 py-1">
      {label}
      <Input
        id={id}
        data-card-control
        key={value}
        defaultValue={value}
        placeholder="Not set"
        disabled={props.disabled}
        className="h-8 w-44 shrink-0 text-xs"
        onKeyDown={(event) => {
          if (event.key !== 'Enter') return;
          event.preventDefault();
          commit(event.currentTarget);
        }}
        onBlur={(event) => commit(event.currentTarget)}
      />
    </div>
  );
}

/**
 * A built-in's `key=value` list as a form (#1218): every key the agent listed, grouped by kind and
 * searchable, each with its current value (`/config`'s from Claude Code's files, through
 * `sessions config`). A change sends `/cmd key=value` to the session; the agent's answer shows
 * under the form, and the values are read again.
 */
export function SettingsCard(props: {
  sessionId: string;
  form: UsageForm;
  /** The answers to the changes made from this card, oldest first. */
  replies: ChatMessage[];
  autoFocus: boolean;
}) {
  const { form, replies } = props;
  const call = useCall();
  const read = useConfigValues(props.sessionId, form, replies.length);
  const [query, setQuery] = useState('');
  /** A change sent and not answered yet: the key and the value picked. */
  const [sent, setSent] = useState<{ key: string; value: string; after: number }>();
  const [failure, setFailure] = useState<string>();
  const waiting = sent !== undefined && sent.after === replies.length;
  // The value picked shows until the values are read again after the agent's answer.
  const values =
    sent && read.at <= sent.after ? { ...read.values, [sent.key]: sent.value } : read.values;
  const last = replies.at(-1);
  const change = async (key: string, value: string) => {
    setFailure(undefined);
    setSent({ key, value, after: replies.length });
    const done = await call('sessions.send', {
      id: props.sessionId,
      prompt: `${form.command} ${key}=${value}`,
    });
    if (!done.ok) {
      setSent(undefined);
      setFailure(done.error.message);
    }
  };
  const shown = form.fields.filter((f) => f.key.toLowerCase().includes(query.trim().toLowerCase()));
  return (
    <div className="flex flex-col gap-3">
      <Input
        data-card-control
        autoFocus={props.autoFocus}
        aria-label={`Search ${form.command} settings`}
        placeholder={`Search ${form.fields.length} settings`}
        className="h-8 text-sm"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
      />
      <div className="max-h-96 overflow-y-auto pr-1">
        {GROUPS.map(({ kind, title }) => {
          const fields = shown.filter((f) => f.kind === kind);
          if (!fields.length) return null;
          return (
            <div key={kind} className="mb-3">
              <SectionLabel className="mb-1">{title}</SectionLabel>
              <div className="grid grid-cols-[repeat(auto-fill,minmax(18rem,1fr))] gap-x-8">
                {fields.map((field) => (
                  <FieldControl
                    key={field.key}
                    field={field}
                    value={values[field.key]}
                    disabled={waiting}
                    onChange={(value) => void change(field.key, value)}
                  />
                ))}
              </div>
            </div>
          );
        })}
        {!shown.length && <Muted size="xs">No setting matches.</Muted>}
      </div>
      {(failure || waiting || last) && (
        <p
          role="status"
          className={cn(
            'text-xs',
            failure || (!waiting && last?.error) ? 'text-destructive' : 'text-muted-foreground',
          )}
        >
          {failure ??
            (waiting
              ? `Setting ${sent.key} to ${sent.value}`
              : `${last?.text.slice(form.command.length).trim()}: ${last?.output || 'no reply'}`)}
        </p>
      )}
    </div>
  );
}
