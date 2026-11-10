import { AGENT_LABELS, AGENT_NAMES, KEEP_AWAKE_LABELS, KEEP_AWAKE_MODES } from '@mesa/core/browser';
import {
  BookMarked,
  CircleDollarSign,
  Coffee,
  GraduationCap,
  Moon,
  ScrollText,
  SquareTerminal,
} from 'lucide-react';
import { Muted } from '@/components/Muted';
import { Button } from '@/components/ui/button';
import { ChoiceField } from './controls/ChoiceField';
import { ToggleField } from './controls/ToggleField';
import { ReviewVoiceRow } from './ReviewVoiceRow';
import { SettingRow } from './SettingRow';
import { SettingSection } from './SettingSection';
import { useSettings } from './useSettings';

/** The idle times a session may sleep after, in minutes; 0 is off (#897). */
const SLEEP_AFTER = [
  ['0', 'Off'],
  ['30', 'After 30 min'],
  ['120', 'After 2 h'],
  ['480', 'After 8 h'],
] as const;

/**
 * What a new session starts with, when a finished one sleeps, whether its output is kept, whether
 * Claude's status line shows its cost, whether its agent gets the agent guidelines, when the Mac
 * stays awake, the review voice, and the saved prompts.
 */
export function SessionSettingsPanel(props: { onSavedPrompts: () => void }) {
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
            <ChoiceField
              id="default-agent"
              path="defaultAgent"
              value={config.defaultAgent}
              options={AGENT_NAMES.map((agent) => [agent, AGENT_LABELS[agent]] as const)}
            />
          }
        />
        <Muted size="xs" className="rounded-lg border bg-card/40 px-4 py-3">
          Agent-owned behavior such as models and reasoning stays in each agent's native
          configuration. Mesa starts the agent you pick and never translates permissions between
          agents.
        </Muted>
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
          control={
            <ToggleField id="sessions-log" path="sessions.log" checked={config.sessions.log} />
          }
        />
      </SettingSection>
      <SettingSection
        id="sleep"
        title="Sleep"
        description="Free the memory of sessions you are done with for now"
      >
        <SettingRow
          icon={Moon}
          title="Sleep finished sessions"
          description="A Claude Code or Codex session you have read, that is not shown and has no child running, quits its agent after this long idle. Opening it, or sending to it, wakes it in the same session."
          htmlFor="sessions-sleep-after"
          keywords="hibernate memory idle sleep wake"
          control={
            <ChoiceField
              id="sessions-sleep-after"
              path="sessions.sleepAfterMinutes"
              value={String(config.sessions.sleepAfterMinutes ?? 0)}
              options={SLEEP_AFTER}
              toValue={Number}
            />
          }
        />
      </SettingSection>
      <SettingSection
        id="status-line"
        title="Status line"
        description="What Claude Code shows under its prompt in Mesa sessions"
      >
        <SettingRow
          icon={CircleDollarSign}
          title="Show session cost"
          description="End Claude's status line with the session's estimated cost, after your own status line. Applies to Claude sessions started or resumed from now on."
          htmlFor="sessions-status-line-cost"
          keywords="statusline cost usage price claude"
          control={
            <ToggleField
              id="sessions-status-line-cost"
              path="sessions.statusLineCost"
              checked={config.sessions.statusLineCost}
            />
          }
        />
      </SettingSection>
      <SettingSection
        id="guidelines"
        title="Guidelines"
        description="Habits Mesa teaches the agents in its sessions"
      >
        <SettingRow
          icon={GraduationCap}
          title="Agent guidelines"
          description="Give every project the agent-guidelines skill, learned from real sessions: ask only what is yours to decide, leave your machine as it was, verify the way you run things. Applies to sessions started or resumed from now on."
          htmlFor="sessions-guidelines"
          keywords="skill habits rules behaviour behavior agent-guidelines"
          control={
            <ToggleField
              id="sessions-guidelines"
              path="sessions.guidelines"
              checked={config.sessions.guidelines}
            />
          }
        />
      </SettingSection>
      <SettingSection
        id="keep-awake"
        title="Sleep"
        description="Whether the Mac may idle-sleep while the app is open"
      >
        <SettingRow
          icon={Coffee}
          title="Keep the Mac awake"
          description="Stop the Mac from idle-sleeping, always or while any session is working, so a long turn does not stall. Only while the app is open; the display can still sleep."
          htmlFor="sessions-keep-awake"
          keywords="sleep caffeinate awake power idle"
          control={
            <ChoiceField
              id="sessions-keep-awake"
              path="sessions.keepAwake"
              value={config.sessions.keepAwake}
              options={KEEP_AWAKE_MODES.map((mode) => [mode, KEEP_AWAKE_LABELS[mode]] as const)}
            />
          }
        />
      </SettingSection>
      <SettingSection
        id="reviews"
        title="PR reviews"
        description="How review sessions write on a pull request"
      >
        <ReviewVoiceRow />
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
