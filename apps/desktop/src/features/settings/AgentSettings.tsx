import type { DoctorReport } from '@mesa/core';
import {
  AGENT_EXECUTABLES,
  AGENT_LABELS,
  AGENT_NAMES,
  CLAUDE_PERMISSION_MODES,
} from '@mesa/core/browser';
import { ListChecks, ShieldAlert } from 'lucide-react';
import { cn } from '@/lib/utils';
import { LaunchSettings } from './agents/LaunchSettings';
import { Choice } from './controls/Choice';
import { TextField } from './controls/TextField';
import { commaList } from './controls/textLists';
import { SettingRow } from './SettingRow';
import { SettingSection } from './SettingSection';
import { useMatches } from './useMatches';
import { useSettings } from './useSettings';

/**
 * Installed agents as Doctor found them, each agent's launch defaults, and how a headless
 * `mesa run` may act.
 */
export function AgentSettings(props: { doctor?: DoctorReport }) {
  const { config, save } = useSettings();
  const overview = useMatches(
    `coding agents installed ${AGENT_NAMES.map((agent) => AGENT_LABELS[agent]).join(' ')}`,
  );
  return (
    <>
      <SettingSection
        id="overview"
        title="Overview"
        description="Installed Coding Agents and native settings"
      >
        <div data-setting-row hidden={!overview} className="grid gap-2 sm:grid-cols-2">
          {AGENT_NAMES.map((agent) => {
            const binary = AGENT_EXECUTABLES[agent];
            const check = props.doctor?.checks.find((found) => found.name === binary);
            return (
              <div key={agent} className="rounded-lg border bg-card/60 px-4 py-3">
                <p className="flex items-center justify-between gap-2 text-sm">
                  {AGENT_LABELS[agent]}
                  <span
                    className={cn(
                      'text-xs',
                      check?.ok ? 'text-state-idle' : 'text-muted-foreground',
                    )}
                  >
                    {!check
                      ? 'Checking...'
                      : check.ok
                        ? `Installed${check.version ? ` · ${check.version}` : ''}`
                        : 'Not installed'}
                  </span>
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Hand the terminal over to the `{binary}` CLI.
                </p>
              </div>
            );
          })}
        </div>
        <p className="rounded-lg border bg-card/40 px-4 py-3 text-xs text-muted-foreground">
          Model selection stays in each agent's native configuration. Mesa does not translate one
          agent's permissions into another's; a handoff uses the target agent's own defaults.
        </p>
      </SettingSection>
      <LaunchSettings />
      <SettingSection
        id="headless"
        title="Headless runs"
        description="How `mesa run` lets Claude act when nobody is watching"
      >
        <SettingRow
          icon={ShieldAlert}
          title="Permission mode"
          description="Claude's --permission-mode for headless runs."
          htmlFor="run-permission-mode"
          control={
            <Choice
              id="run-permission-mode"
              path="run.permissionMode"
              value={config.run.permissionMode}
              options={CLAUDE_PERMISSION_MODES.map((mode) => [mode, mode] as const)}
            />
          }
        />
        <SettingRow
          icon={ListChecks}
          title="Allowed tools"
          description="Claude's --allowedTools for headless runs, comma separated; empty allows none beyond the mode."
          htmlFor="run-allowed-tools"
          control={
            <TextField
              id="run-allowed-tools"
              value={config.run.allowedTools.join(', ')}
              placeholder="e.g. Read, Grep, Bash(git status)"
              parse={commaList}
              onSave={(value) => save('run.allowedTools', value)}
            />
          }
        />
      </SettingSection>
    </>
  );
}
