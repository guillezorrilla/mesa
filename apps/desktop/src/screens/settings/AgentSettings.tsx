import type { Config, DoctorReport } from '@mesa/core';
import {
  AGENT_EXECUTABLES,
  AGENT_LABELS,
  AGENT_NAMES,
  ANTIGRAVITY_MODES,
  CLAUDE_PERMISSION_MODES,
  CODEX_APPROVAL_POLICIES,
  CODEX_SANDBOXES,
} from '@mesa/core/browser';
import {
  Box,
  Compass,
  ListChecks,
  type LucideIcon,
  ShieldAlert,
  ShieldOff,
  UserCheck,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Choice, commaList, TextField } from './controls';
import { SettingRow, SettingSection, useMatches } from './SettingRow';
import { useSettings } from './useSettings';

type Launch = Config['agents'];

/** A flag that is either passed or left to the agent's native config. */
const ON = [['on', 'On']] as const;

/**
 * One native launch default of `agent`, in its own terms: "Use native config" leaves it unset, so
 * nothing is passed. The agent's map is saved whole, so an unset field is removed from it.
 */
function LaunchRow<A extends keyof Launch>(props: {
  agent: A;
  field: keyof Launch[A] & string;
  title: string;
  description: string;
  icon: LucideIcon;
  options: readonly (readonly [string, string])[];
  danger?: boolean;
  /** A value that turns off the agent's checks, so the row is red while it is set. */
  dangerousValue?: string;
}) {
  const { config } = useSettings();
  const current: Record<string, unknown> = config.agents[props.agent];
  const set = current[props.field];
  const id = `launch-${props.agent}-${props.field}`;
  return (
    <SettingRow
      icon={props.icon}
      title={props.title}
      description={props.description}
      keywords={`${AGENT_LABELS[props.agent]} launch native`}
      htmlFor={id}
      tone={
        props.danger || (set !== undefined && set === props.dangerousValue) ? 'danger' : undefined
      }
      control={
        <Choice
          id={id}
          path={`agents.${props.agent}`}
          value={set === true ? 'on' : typeof set === 'string' ? set : ''}
          options={[['', 'Use native config'], ...props.options]}
          toValue={(option) => {
            const { [props.field]: _, ...rest } = current;
            return option === '' ? rest : { ...rest, [props.field]: option === 'on' || option };
          }}
        />
      }
    />
  );
}

const values = (list: readonly string[]) => list.map((value) => [value, value] as const);

/** Each agent's native launch defaults on new and resumed sessions, never translated. */
function LaunchSettings() {
  return (
    <>
      <SettingSection
        id="claude"
        title={AGENT_LABELS.claude}
        description="Launch flags for new and resumed Claude Code sessions"
      >
        <LaunchRow
          agent="claude"
          field="skipPermissions"
          icon={ShieldOff}
          title="Skip permissions"
          description="Danger: --dangerously-skip-permissions runs every tool without asking. Plan mode still starts in plan."
          options={ON}
          danger
        />
      </SettingSection>
      <SettingSection
        id="codex"
        title={AGENT_LABELS.codex}
        description="Launch flags for new and resumed Codex sessions"
      >
        <LaunchRow
          agent="codex"
          field="approvalPolicy"
          icon={UserCheck}
          title="Approval policy"
          description="Codex's --ask-for-approval."
          options={values(CODEX_APPROVAL_POLICIES)}
        />
        <LaunchRow
          agent="codex"
          field="sandbox"
          icon={Box}
          title="Sandbox"
          description="Codex's --sandbox. Danger: danger-full-access runs commands with no sandbox."
          options={values(CODEX_SANDBOXES)}
          dangerousValue="danger-full-access"
        />
        <LaunchRow
          agent="codex"
          field="bypass"
          icon={ShieldOff}
          title="Bypass approvals and sandbox"
          description="Danger: --dangerously-bypass-approvals-and-sandbox asks nothing and runs unsandboxed; it replaces the approval policy and sandbox."
          options={ON}
          danger
        />
      </SettingSection>
      <SettingSection
        id="antigravity"
        title={AGENT_LABELS.antigravity}
        description="Launch flags for new and resumed Antigravity CLI sessions"
      >
        <LaunchRow
          agent="antigravity"
          field="skipPermissions"
          icon={ShieldOff}
          title="Skip permissions"
          description="Danger: --dangerously-skip-permissions approves every tool request without asking."
          options={ON}
          danger
        />
        <LaunchRow
          agent="antigravity"
          field="mode"
          icon={Compass}
          title="Mode"
          description="Antigravity's --mode; a session started in plan stays in plan."
          options={values(ANTIGRAVITY_MODES)}
        />
        <LaunchRow
          agent="antigravity"
          field="sandbox"
          icon={Box}
          title="Sandbox"
          description="Antigravity's --sandbox, with terminal restrictions."
          options={ON}
        />
      </SettingSection>
    </>
  );
}

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
