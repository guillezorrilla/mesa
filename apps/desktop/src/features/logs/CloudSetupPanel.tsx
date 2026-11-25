import { type ReactNode, useEffect, useState } from 'react';
import { Muted } from '@/components/Muted';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { useOptional, useRun } from '@/lib/useCommand';
import { CloudEnvPicker } from './CloudEnvPicker';
import { CloudProjectPicker } from './CloudProjectPicker';
import { useEnvRows } from './useEnvRows';
import { useImportMetrics } from './useImportMetrics';

const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? '' : 's'}`;

/** One numbered section of the setup. */
function Step(props: { n: number; title: string; hint: string; children: ReactNode }) {
  return (
    <section
      aria-label={props.title}
      className="grid grid-cols-[1.5rem_minmax(0,1fr)] gap-x-4 gap-y-3 border-t pt-6 first:border-t-0 first:pt-0"
    >
      <span
        aria-hidden
        className="grid size-6 place-items-center rounded-full bg-foreground font-mono text-[11px] font-semibold text-background"
      >
        {props.n}
      </span>
      <header className="grid gap-0.5">
        <h3 className="text-sm leading-6 font-semibold">{props.title}</h3>
        <Muted size="xs">{props.hint}</Muted>
      </header>
      <div className="col-start-2 min-w-0">{props.children}</div>
    </section>
  );
}

/**
 * Cloud Logs' first run (CONTEXT.md, Cloud Logs): the GCP projects (every one the account sees,
 * loaded once), envs suggested from their GKE clusters and Cloud Run services, and saved views from
 * their log-based metrics; Save writes logs.gcp. Later, the toolbar's project switcher changes the
 * projects and the Logs menu's Edit envs the envs.
 */
export function CloudSetupPanel(props: { onSaved: () => void }) {
  const found = useOptional('logs.gcpProjects', {});
  const [picked, setPicked] = useState<string[]>([]);
  const { rows, setRows, suggested, envs } = useEnvRows(picked);
  const [importing, setImporting] = useState(true);
  const [saving, setSaving] = useState(false);
  const run = useRun();
  const importMetrics = useImportMetrics();
  const current = found.data?.current;
  // The first setup starts from gcloud's default project.
  useEffect(() => {
    if (current) setPicked((now) => (now.length ? now : [current]));
  }, [current]);
  const envCount = Object.keys(envs).length;
  const fix = (found.error?.details as { fix?: string } | undefined)?.fix;
  const save = async () => {
    setSaving(true);
    const saved = await run('logs.gcpSetup', { projects: picked, envs });
    if (saved && importing) await importMetrics(picked);
    setSaving(false);
    if (saved) props.onSaved();
  };
  return (
    <section aria-label="Set up Cloud Logs" className="mx-auto grid w-full max-w-3xl gap-8 py-6">
      <header className="grid gap-1">
        <h2 className="text-lg font-semibold tracking-tight">Read your Google Cloud logs</h2>
        <Muted>
          Mesa reads the projects with your own gcloud sign-in, so it keeps no Google token.
        </Muted>
      </header>
      <div className="grid gap-6">
        <Step n={1} title="Projects" hint="The GCP projects your services log to, read together.">
          <CloudProjectPicker
            projects={found.data?.projects}
            groups={found.data?.groups}
            current={current}
            picked={picked}
            onPicked={setPicked}
            error={found.error && !found.busy ? { message: found.error.message, fix } : undefined}
            onRetry={() => void found.refresh()}
          />
        </Step>
        <Step
          n={2}
          title="Envs"
          hint="Optional. Each env is a Logging filter applied in every project; rows of one name join."
        >
          <CloudEnvPicker
            rows={rows}
            busy={suggested.busy}
            error={suggested.error && !suggested.busy ? suggested.error.message : undefined}
            onRetry={() => void suggested.refresh()}
            onRows={setRows}
          />
        </Step>
        <Step
          n={3}
          title="Saved views"
          hint="Filters you open in Explore; a log-based metric's view also counts over days."
        >
          <Label className="gap-2 text-sm font-normal">
            <Checkbox checked={importing} onCheckedChange={(on) => setImporting(on === true)} />
            Turn each project's log-based metrics into saved views
          </Label>
        </Step>
      </div>
      <footer className="flex items-center gap-2 border-t pt-5">
        <Button disabled={!picked.length || saving} onClick={() => void save()}>
          {saving
            ? 'Saving'
            : `Save ${plural(picked.length, 'project')}${envCount ? ` and ${plural(envCount, 'env')}` : ''}`}
        </Button>
      </footer>
    </section>
  );
}
