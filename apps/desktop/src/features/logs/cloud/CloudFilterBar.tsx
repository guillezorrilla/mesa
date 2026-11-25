import type { GcpLogs } from '@mesa/core';
import { ALL_ENVS } from '@mesa/core/browser';
import type { ReactNode } from 'react';
import { SegmentedControl } from '@/components/SegmentedControl';
import { Label } from '@/components/ui/label';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { Switch } from '@/components/ui/switch';
import type { CloudFilters } from '@/lib/client/logs';
import type { CloudMode } from '@/lib/workspaceView';
import { CloudProjectSwitcher } from './CloudProjectSwitcher';
import { CloudServiceField } from './CloudServiceField';
import { CLOUD_RANGES, type CloudRange } from './cloudLines';

/**
 * The Logs tab's bar (CONTEXT.md, Cloud Logs): the projects read, Errors or Explorer, the env (All
 * envs too), services, range and "Your services only", then `actions` on the right.
 */
export function CloudFilterBar(props: {
  gcp: GcpLogs;
  mode: CloudMode;
  filters: CloudFilters;
  env: string | undefined;
  onMode: (mode: CloudMode) => void;
  onFilters: (filters: CloudFilters) => void;
  actions?: ReactNode;
}) {
  const { filters } = props;
  const envs = Object.keys(props.gcp.envs);
  const set = (next: Partial<CloudFilters>) => props.onFilters({ ...filters, ...next });
  return (
    <div className="flex flex-wrap items-center gap-2 [&_[data-slot=native-select-wrapper]]:w-auto">
      <CloudProjectSwitcher
        gcp={props.gcp}
        onSwitched={() => set({ services: undefined, projects: undefined })}
      />
      <SegmentedControl<CloudMode>
        label="View"
        value={props.mode}
        onChange={props.onMode}
        options={[
          ['errors', 'Errors'],
          ['explorer', 'Explorer'],
        ]}
      />
      <span aria-hidden className="mx-1 h-5 w-px bg-border" />
      {envs.length > 0 && (
        <NativeSelect
          aria-label="Env"
          size="sm"
          className="text-xs"
          value={props.env}
          onChange={(event) => set({ env: event.currentTarget.value, services: undefined })}
        >
          <NativeSelectOption value={ALL_ENVS}>All envs</NativeSelectOption>
          {envs.map((name) => (
            <NativeSelectOption key={name} value={name}>
              {name}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      )}
      <CloudServiceField
        env={filters.env}
        picked={filters.services ?? []}
        onChange={(picked) => set({ services: picked.length ? picked : undefined })}
      />
      <NativeSelect
        aria-label="Time range"
        size="sm"
        className="text-xs"
        value={filters.since ?? '1h'}
        onChange={(event) => set({ since: event.currentTarget.value })}
      >
        {Object.entries(CLOUD_RANGES).map(([value, [label]]) => (
          <NativeSelectOption key={value} value={value as CloudRange}>
            {label}
          </NativeSelectOption>
        ))}
      </NativeSelect>
      <Label
        className="gap-1.5 text-xs font-normal text-muted-foreground"
        title="Leaves out load balancer, proxy, GKE system and audit logs"
      >
        <Switch
          checked={!filters.all}
          onCheckedChange={(on) => set({ all: on ? undefined : true })}
        />
        Your services only
      </Label>
      {props.env === 'prod' && props.mode === 'explorer' && (
        <span className="inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11.5px] text-muted-foreground">
          <span aria-hidden className="size-1.5 rounded-full bg-state-waiting" />
          prod: Claude reads masked entries
        </span>
      )}
      <div className="ml-auto flex items-center gap-1">{props.actions}</div>
    </div>
  );
}
