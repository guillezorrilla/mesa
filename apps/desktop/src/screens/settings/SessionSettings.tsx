import { AGENT_LABELS, AGENT_NAMES } from '@mesa/core/browser';
import { BookMarked, ScrollText, SquareTerminal } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Choice, Toggle } from './controls';
import { SettingRow, SettingSection } from './SettingRow';
import { useSettings } from './useSettings';

/** What a new session starts with, whether its output is kept, and the saved prompts. */
export function SessionSettings(props: { onSavedPrompts: () => void }) {
  const { config } = useSettings();
  return (
    <>
      <SettingSection
        id="defaults"
        title="Defaults"
        description="Default Coding Agent for new sessions"
        group="Session defaults"
        groupIcon={SquareTerminal}
      >
        <SettingRow
          title="Default Coding Agent"
          description="Pre-selected for new sessions and automated session starters"
          htmlFor="default-agent"
          keywords="model claude codex antigravity"
          control={
            <Choice
              id="default-agent"
              path="defaultAgent"
              value={config.defaultAgent}
              options={AGENT_NAMES.map((agent) => [agent, AGENT_LABELS[agent]] as const)}
            />
          }
        />
        <p className="rounded-lg border bg-card/40 px-4 py-3 text-xs text-muted-foreground">
          Agent-owned behavior such as models and reasoning stays in each agent's native
          configuration. Mesa starts the agent you pick and never translates permissions between
          agents.
        </p>
      </SettingSection>
      <SettingSection
        id="logs"
        title="Session logs"
        description="What Mesa keeps of each session's terminal"
      >
        <SettingRow
          icon={ScrollText}
          title="Keep output logs"
          description="Record each new session's terminal output in the profile, so its log can be read back later."
          htmlFor="sessions-log"
          control={<Toggle id="sessions-log" path="sessions.log" checked={config.sessions.log} />}
        />
      </SettingSection>
      <SettingSection
        id="saved-prompts"
        title="Saved Prompts"
        description="Manage reusable prompts"
      >
        <SettingRow
          icon={BookMarked}
          title="Saved prompts library"
          description="Manage reusable prompts that can be inserted into any session."
          control={
            <Button size="sm" variant="secondary" onClick={props.onSavedPrompts}>
              Manage
            </Button>
          }
        />
      </SettingSection>
    </>
  );
}
