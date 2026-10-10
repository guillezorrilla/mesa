import { useState } from 'react';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { useCommand } from '@/lib/useCommand';
import { NewPromptForm } from './NewPromptForm';

/** The select's value for New prompt: not a name a prompt can have (names are trimmed). */
const NEW = ' new';

/**
 * Picks a Saved prompt by name, or none (`empty` says what none means), and writes a new one in
 * place: New prompt opens a form under the select, and the prompt it saves is picked.
 */
export function PromptField(props: {
  id: string;
  value: string | null;
  /** The words for no prompt: "No prompt", or "Use the default (Ticket flow)". */
  empty: string;
  disabled?: boolean;
  onChange: (name: string | null) => void;
}) {
  const prompts = useCommand('prompts.list');
  const [writing, setWriting] = useState(false);
  return (
    <div className="grid gap-2">
      <NativeSelect
        id={props.id}
        value={writing ? NEW : (props.value ?? '')}
        disabled={props.disabled}
        onChange={(event) => {
          const value = event.currentTarget.value;
          if (value === NEW) return setWriting(true);
          setWriting(false);
          props.onChange(value || null);
        }}
      >
        <NativeSelectOption value="">{props.empty}</NativeSelectOption>
        {prompts.data?.map((p) => (
          <NativeSelectOption key={p.name} value={p.name}>
            {p.name}
          </NativeSelectOption>
        ))}
        <NativeSelectOption value={NEW}>New prompt...</NativeSelectOption>
      </NativeSelect>
      {writing && (
        <NewPromptForm
          onCancel={() => setWriting(false)}
          onSaved={(name) =>
            void prompts.refresh().then(() => {
              setWriting(false);
              props.onChange(name);
            })
          }
        />
      )}
    </div>
  );
}
