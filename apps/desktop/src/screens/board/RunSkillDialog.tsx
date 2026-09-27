import type { Agent, ProjectRow } from '@mesa/core';
import { Play } from 'lucide-react';
import { useState } from 'react';
import { ActionDialog } from '@/components/ActionDialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { useCommand } from '@/lib/useCommand';
import { AgentField } from './AgentField';
import { ProjectSelect } from './ProjectSelect';

export type RunSkillInput = { skill: string; project: string; agent: Agent; args: string };

/**
 * The Run skill dialog, modal (CONTEXT.md, Skill run): a registered project, one of the skills it
 * enables (the library's or its own), an agent (v1 runs Claude Code only), and the skill's
 * arguments, the words after `/<skill>` in its prompt. It opens once the projects are read, on
 * the first whose folder is there.
 */
export function RunSkillDialog(props: {
  onRun: (input: RunSkillInput) => void;
  onCancel: () => void;
}) {
  const projects = useCommand('projects.list');
  if (!projects.data) return null;
  const first = projects.data.find((p) => p.exists)?.name;
  return <RunSkillForm {...props} projects={projects.data} first={first} />;
}

function RunSkillForm(props: {
  projects: ProjectRow[];
  first: string | undefined;
  onRun: (input: RunSkillInput) => void;
  onCancel: () => void;
}) {
  const [project, setProject] = useState(props.first);
  const listed = useCommand('skills.list', { project });
  const skills = project ? (listed.data?.filter((s) => s.enabled) ?? []) : [];
  const [picked, setPicked] = useState<string>();
  // The skill picked, while the project enables it; else its first.
  const skill = skills.find((s) => s.name === picked) ?? skills[0];
  return (
    <ActionDialog
      testId="run-skill-dialog"
      wide
      title="Run skill"
      description="Runs a skill headlessly in its own session on the Board; a toast says when it ends."
      submit={{
        label: (
          <>
            <Play aria-hidden />
            Run
          </>
        ),
        testId: 'run-skill-submit',
        disabled: !project || !skill,
      }}
      onSubmit={(form) => {
        const data = new FormData(form);
        if (!project || !skill) return;
        props.onRun({
          project,
          skill: skill.name,
          agent: String(data.get('agent') ?? 'claude') as Agent,
          args: String(data.get('args') ?? ''),
        });
      }}
      onCancel={props.onCancel}
    >
      <div className="grid gap-2">
        <Label htmlFor="run-skill-project">Project</Label>
        <ProjectSelect
          id="run-skill-project"
          data-testid="run-skill-project"
          projects={props.projects}
          value={project ?? ''}
          onChange={(e) => setProject(e.target.value)}
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="run-skill-skill">Skill</Label>
        <NativeSelect
          id="run-skill-skill"
          data-testid="run-skill-skill"
          className="font-mono"
          value={skill?.name ?? ''}
          onChange={(e) => setPicked(e.target.value)}
          disabled={!skills.length}
        >
          {skills.map((s) => (
            <NativeSelectOption key={s.name} value={s.name}>
              {s.name}
            </NativeSelectOption>
          ))}
        </NativeSelect>
        <p data-testid="run-skill-about" className="line-clamp-2 text-muted-foreground text-xs">
          {skill?.description ??
            (!project
              ? 'No project to run on: register one on the Projects screen.'
              : listed.data &&
                `No skill is enabled for ${project}: add one to the profile's skills or to its mesa.yaml.`)}
        </p>
      </div>
      <AgentField />
      <div className="grid gap-2">
        <Label htmlFor="run-skill-args">Arguments (optional)</Label>
        <Input
          id="run-skill-args"
          name="args"
          data-testid="run-skill-args"
          className="font-mono"
          placeholder={`The words after /${skill?.name ?? 'skill'} in its prompt`}
        />
      </div>
    </ActionDialog>
  );
}
