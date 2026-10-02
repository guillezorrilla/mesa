import type { LucideIcon } from 'lucide-react';
import { useState } from 'react';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { TextField } from '../controls/TextField';
import { lineList } from '../controls/textLists';
import { SettingRow } from '../SettingRow';
import { profileValue } from './profileValue';

const SCRIPT_MODES = [
  ['inherit', 'Use profile setting'],
  ['none', 'None'],
  ['custom', 'Custom'],
] as const;

/**
 * A setup or teardown override: the profile's (left out of mesa.yaml), none (an empty list, so the
 * profile's does not run either), or this project's own argv.
 */
export function ScriptRow(props: {
  script: 'setup' | 'teardown';
  title: string;
  icon: LucideIcon;
  value: string[] | undefined;
  profile: string[];
  acting: boolean;
  onSave: (value: string[] | undefined) => void;
}) {
  const id = `project-worktree-${props.script}`;
  const [picking, setPicking] = useState(false);
  const stored = props.value === undefined ? 'inherit' : props.value.length ? 'custom' : 'none';
  const mode = picking ? 'custom' : stored;
  return (
    <SettingRow
      icon={props.icon}
      title={props.title}
      description={`${profileValue(props.profile, 'none')}. The executable and its arguments, one per line; runs without a shell.`}
      keywords={`project ${props.script}`}
      htmlFor={`${id}-mode`}
      control={
        <NativeSelect
          id={`${id}-mode`}
          className="min-w-40"
          value={mode}
          disabled={props.acting}
          onChange={(event) => {
            const next = event.currentTarget.value as (typeof SCRIPT_MODES)[number][0];
            setPicking(next === 'custom');
            if (next === 'inherit') props.onSave(undefined);
            if (next === 'none') props.onSave([]);
          }}
        >
          {SCRIPT_MODES.map(([value, label]) => (
            <NativeSelectOption key={value} value={value}>
              {label}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      }
    >
      {mode === 'custom' && (
        <TextField
          id={id}
          multiline
          value={props.value?.join('\n') ?? ''}
          placeholder={'pnpm\ninstall'}
          parse={(text) => {
            const { value } = lineList(text);
            return value.length
              ? { value }
              : { error: 'Enter the executable and its arguments, or choose None.' };
          }}
          onSave={(value) => props.onSave(value as string[])}
        />
      )}
    </SettingRow>
  );
}
