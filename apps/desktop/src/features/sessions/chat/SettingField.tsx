import type { ConfigSetting, UsageField } from '@mesa/core';
import { readableName } from '@mesa/core/browser';
import { RotateCcw } from 'lucide-react';
import { IconButton } from '@/components/IconButton';
import { Input } from '@/components/ui/input';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { Switch } from '@/components/ui/switch';

/** One key's control: a switch, a select of the agent's values, or a field committed with Enter or on leaving it. */
function Control(props: {
  id: string;
  field: UsageField;
  value?: string;
  disabled: boolean;
  onChange: (value: string) => void;
}) {
  const { field, value, id } = props;
  if (field.kind === 'boolean')
    return (
      <Switch
        id={id}
        data-card-control
        checked={value === 'true'}
        disabled={props.disabled}
        onCheckedChange={(on) => props.onChange(String(on))}
      />
    );
  if (field.kind === 'choice') {
    const choices =
      value && !field.choices.includes(value) ? [value, ...field.choices] : field.choices;
    return (
      <div className="w-40 shrink-0">
        <NativeSelect
          id={id}
          data-card-control
          size="sm"
          value={value ?? ''}
          disabled={props.disabled}
          onChange={(event) => props.onChange(event.target.value)}
        >
          {value === undefined && (
            <NativeSelectOption value="" disabled>
              Default
            </NativeSelectOption>
          )}
          {choices.map((one) => (
            <NativeSelectOption key={one} value={one}>
              {readableName(one)}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      </div>
    );
  }
  const commit = (input: HTMLInputElement) => {
    const next = input.value.trim();
    if (next && next !== (value ?? '')) props.onChange(next);
  };
  return (
    <Input
      id={id}
      data-card-control
      key={value}
      defaultValue={value}
      placeholder="Default"
      disabled={props.disabled}
      className="h-8 w-40 shrink-0 text-xs"
      onKeyDown={(event) => {
        if (event.key !== 'Enter') return;
        event.preventDefault();
        commit(event.currentTarget);
      }}
      onBlur={(event) => commit(event.currentTarget)}
    />
  );
}

/**
 * A setting's row: its name with a line on what it does, and its control. A value at Claude Code's
 * default (or none read) is marked Default; another, where the default is known, can be reset to it.
 */
export function SettingField(props: {
  setting: ConfigSetting;
  field: UsageField;
  value?: string;
  disabled: boolean;
  onChange: (value: string) => void;
}) {
  const { setting, value } = props;
  const id = `setting-${setting.key}`;
  const atDefault = value === undefined || value === setting.fallback;
  return (
    <div className="-mx-2 flex items-center gap-4 rounded-md px-2 py-2.5 focus-within:bg-muted/50 hover:bg-muted/30">
      <div className="min-w-0 flex-1">
        <label htmlFor={id} className="block truncate text-sm" title={setting.key}>
          {setting.name}
        </label>
        {setting.description && (
          <p className="truncate text-muted-foreground text-xs">{setting.description}</p>
        )}
      </div>
      {atDefault ? (
        <span className="text-[11px] text-muted-foreground">Default</span>
      ) : (
        setting.fallback !== undefined && (
          <IconButton
            label={`Reset ${setting.name} to default`}
            icon={RotateCcw}
            size="icon-xs"
            disabled={props.disabled}
            onClick={() => props.onChange(setting.fallback ?? '')}
          />
        )
      )}
      <Control
        id={id}
        field={props.field}
        value={value}
        disabled={props.disabled}
        onChange={props.onChange}
      />
    </div>
  );
}
