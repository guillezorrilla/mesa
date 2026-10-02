import {
  AGENT_LABELS,
  ANTIGRAVITY_MODES,
  CODEX_APPROVAL_POLICIES,
  CODEX_SANDBOXES,
} from '@mesa/core/browser';
import { Box, Compass, ShieldOff, UserCheck } from 'lucide-react';
import { SettingSection } from '../SettingSection';
import { LaunchRow } from './LaunchRow';

/** A flag that is either passed or left to the agent's native config. */
const ON = [['on', 'On']] as const;

const values = (list: readonly string[]) => list.map((value) => [value, value] as const);

/** Each agent's native launch defaults on new and resumed sessions, never translated. */
export function LaunchSettings() {
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
