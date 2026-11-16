import type { ChatMessage, UsageForm } from '@mesa/core';
import { CONFIG_GROUPS, configSetting, readableName } from '@mesa/core/browser';
import { Search } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Muted } from '@/components/Muted';
import { SectionLabel } from '@/components/SectionLabel';
import { Input } from '@/components/ui/input';
import { useCall } from '@/lib/useCommand';
import { cn } from '@/lib/utils';
import { SettingField } from './SettingField';

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
 * A built-in's `key=value` list as a settings list (#1218, #1233): every key the agent listed, by
 * readable name under its topic, searchable by name, description or key, each with its current
 * value (`/config`'s from Claude Code's files, through `sessions config`). A change sends
 * `/cmd key=value` to the session; the agent's answer shows under the list, and the values are read
 * again. Escape clears the search before it closes the card.
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
  const words = query.trim().toLowerCase();
  const rows = form.fields
    .map((field) => ({ field, setting: configSetting(field.key) }))
    .filter(({ setting }) =>
      [setting.name, setting.description, setting.key].some((text) =>
        text.toLowerCase().includes(words),
      ),
    )
    .sort((a, b) => a.setting.name.localeCompare(b.setting.name));
  return (
    <div className="flex flex-col gap-2">
      <div className="relative">
        <Search
          aria-hidden
          className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground"
        />
        <Input
          data-card-control
          autoFocus={props.autoFocus}
          aria-label={`Search ${form.command} settings`}
          placeholder={`Search ${form.fields.length} settings`}
          className="h-8 pl-8 text-sm"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key !== 'Escape' || !query) return;
            event.preventDefault();
            setQuery('');
          }}
        />
      </div>
      <div className="max-h-[26rem] overflow-y-auto pr-1">
        {CONFIG_GROUPS.map((group) => {
          const inGroup = rows.filter((row) => row.setting.group === group);
          if (!inGroup.length) return null;
          return (
            <section key={group} aria-label={group}>
              <SectionLabel className="sticky top-0 z-10 bg-card pt-3 pb-1">{group}</SectionLabel>
              {inGroup.map(({ field, setting }) => (
                <SettingField
                  key={field.key}
                  setting={setting}
                  field={field}
                  value={values[field.key]}
                  disabled={waiting}
                  onChange={(value) => void change(field.key, value)}
                />
              ))}
            </section>
          );
        })}
        {!rows.length && (
          <Muted size="xs" className="py-3">
            No setting matches.
          </Muted>
        )}
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
              ? `Setting ${configSetting(sent.key).name} to ${readableName(sent.value)}`
              : `${last?.text.slice(form.command.length).trim()}: ${last?.output || 'no reply'}`)}
        </p>
      )}
    </div>
  );
}
