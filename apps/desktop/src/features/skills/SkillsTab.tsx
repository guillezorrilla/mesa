import type { Config, SkillInventoryRow } from '@mesa/core';
import { GUIDELINES } from '@mesa/core/browser';
import { RefreshCw } from 'lucide-react';
import { useState } from 'react';
import { Muted } from '@/components/Muted';
import { warningOf } from '@/components/Toast';
import { Button } from '@/components/ui/button';
import { useAct } from '@/lib/useAct';
import { useCommand, useRun } from '@/lib/useCommand';
import { cn } from '@/lib/utils';
import { SkillCard } from './SkillCard';
import { SkillPanel } from './SkillPanel';
import { inTab, SKILL_TABS, type SkillTab, skillCards } from './skillScopes';

const DEFAULT_EDITOR: Config['editor'] = {
  fontSize: 13,
  tabSize: 2,
  wordWrap: false,
  vim: false,
  external: [],
};

/** Installed skills are browsed here, one page per skill; their invocation stays in the terminal. */
export function SkillsTab(props: {
  project: string;
  onDirtyChange: (dirty: boolean) => void;
  onAgentSettings: () => void;
}) {
  const skills = useCommand('skills.list', { project: props.project });
  const config = useCommand('config.get');
  const projects = useCommand('projects.list');
  const run = useRun();
  const { acting, act } = useAct();
  const [tab, setTab] = useState<SkillTab>('all');
  const [picked, setPicked] = useState<string>();
  const cards = skillCards(skills.data ?? []);
  // The open skill as the latest list has it, so a toggle or save shows on its page.
  const selected = cards.find((card) => card.id === picked);
  const toggle = (row: SkillInventoryRow) =>
    act(async () => {
      const enabled = config.data?.skills ?? [];
      const next = enabled.includes(row.name)
        ? enabled.filter((name) => name !== row.name)
        : [...enabled, row.name];
      const changed = await run('config.set', { path: 'skills', value: next });
      if (!changed) return undefined;
      const synced = await run('skills.sync', { project: props.project });
      await Promise.all([config.refresh(), skills.refresh()]);
      if (!synced) return undefined;
      return warningOf(synced);
    });
  const toggleProject = (row: SkillInventoryRow, enabled: boolean) =>
    act(async () => {
      const changed = await run('skills.set', { project: props.project, name: row.name, enabled });
      if (!changed) return undefined;
      const synced = await run('skills.sync', { project: props.project });
      await Promise.all([projects.refresh(), skills.refresh()]);
      if (!synced) return undefined;
      return warningOf(synced);
    });
  if (selected) {
    const inProfile = config.data?.skills.includes(selected.name);
    const inProject = projects.data
      ?.find((row) => row.name === props.project)
      ?.skills.includes(selected.name);
    // On through sessions.guidelines: Settings owns it, so the policy buttons would only fail.
    const bySetting = selected.name === GUIDELINES && config.data?.sessions.guidelines;
    return (
      <section data-testid="skills-workspace">
        <SkillPanel
          key={selected.id}
          project={props.project}
          row={selected}
          editor={config.data?.editor ?? DEFAULT_EDITOR}
          onBack={() => setPicked(undefined)}
          onSaved={skills.refresh}
          onDirtyChange={props.onDirtyChange}
          actions={
            selected.source === 'mesa' &&
            !bySetting && (
              <>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={acting || !config.data}
                  onClick={() => void toggle(selected)}
                >
                  {inProfile ? 'Disable in profile' : 'Enable in profile'}
                </Button>
                {(!inProfile || inProject) && (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={acting || !projects.data}
                    onClick={() => void toggleProject(selected, !inProject)}
                  >
                    {inProject && inProfile
                      ? 'Remove project override'
                      : inProject
                        ? 'Disable in project'
                        : 'Enable in project'}
                  </Button>
                )}
              </>
            )
          }
          notes={
            <>
              {selected.invalidReason && <p>{selected.invalidReason}</p>}
              {selected.enabled && selected.source === 'mesa' && !inProfile && inProject && (
                <p>Enabled by the project's mesa.yaml skill policy.</p>
              )}
              {selected.source === 'mesa' && inProfile && (
                <p>Enabled by the profile in every project.</p>
              )}
              {bySetting && (
                <p>Enabled in every project by Settings &gt; Sessions &gt; Agent guidelines.</p>
              )}
              {selected.conflicts.length > 0 && (
                <p className="break-all text-state-waiting">
                  Same-name skill also found at {selected.conflicts.join(', ')}. The provider
                  decides which to offer; Mesa does not choose a winner.
                </p>
              )}
            </>
          }
        />
      </section>
    );
  }
  const visible = inTab(cards, tab);
  return (
    <section data-testid="skills-workspace" className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <fieldset className="flex flex-wrap gap-1">
          <legend className="sr-only">Skill scope</legend>
          {SKILL_TABS.filter((name) => name === 'all' || inTab(cards, name).length > 0).map(
            (name) => (
              <button
                key={name}
                type="button"
                aria-pressed={tab === name}
                className={cn(
                  'rounded-full px-3 py-1 text-sm capitalize text-muted-foreground hover:text-foreground',
                  'aria-pressed:bg-accent aria-pressed:text-foreground',
                )}
                onClick={() => setTab(name)}
              >
                {name} ({inTab(cards, name).length})
              </button>
            ),
          )}
        </fieldset>
        <span className="ml-auto flex gap-2">
          <Button size="sm" variant="ghost" onClick={props.onAgentSettings}>
            Coding agents
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={acting}
            onClick={() =>
              void act(async () => {
                const synced = await run('skills.sync', { project: props.project });
                if (!synced) return undefined;
                await skills.refresh();
                return warningOf(synced);
              })
            }
          >
            <RefreshCw aria-hidden className="size-4" /> Sync
          </Button>
        </span>
      </div>
      <Muted size="xs">
        Invoke an enabled skill from the session terminal with your agent's command.
      </Muted>
      <div className="grid gap-3 md:grid-cols-2">
        {visible.map((row) => (
          <SkillCard key={row.id} row={row} onOpen={() => setPicked(row.id)} />
        ))}
      </div>
      {visible.length === 0 && <Muted>No skills found.</Muted>}
    </section>
  );
}
