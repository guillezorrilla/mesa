import type { Config, WorktreeAction, WorktreePreview, WorktreeRow } from '@mesa/core';
import { FolderGit2, Plus, RefreshCw } from 'lucide-react';
import { useEffect, useState } from 'react';
import { ActionDialog } from '@/components/ActionDialog';
import { said } from '@/components/Toast';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { Textarea } from '@/components/ui/textarea';
import { useAct } from '@/lib/useAct';
import { useCommand, useRun } from '@/lib/useCommand';

const DEFAULT_SETTINGS: Config['worktrees'] = {
  location: 'profile',
  fetch: false,
  sparseDirectories: [],
  carryIgnoredDirectories: [],
  setup: [],
  teardown: [],
};

/** Git inventory with the current profile's unfinished session holders. */
export function WorktreesWorkspace(props: { project: string; onSession: (id: string) => void }) {
  const worktrees = useCommand('worktrees.list', { project: props.project });
  const config = useCommand('config.get');
  const run = useRun();
  const { acting, act } = useAct();
  const [createOpen, setCreateOpen] = useState(false);
  const [preview, setPreview] = useState<WorktreePreview | null>(null);
  const [settings, setSettings] = useState<Config['worktrees']>(DEFAULT_SETTINGS);
  useEffect(() => {
    if (config.data) setSettings(config.data.worktrees);
  }, [config.data]);
  const create = (branch: string, base: string) =>
    act(async () => {
      const result = await run('worktrees.create', {
        project: props.project,
        branch,
        base: base || undefined,
      });
      if (!result) return undefined;
      setCreateOpen(false);
      await worktrees.refresh();
      return said(`Created ${branch} worktree`, result);
    });
  const saveSettings = () =>
    act(async () => {
      const result = await run('config.set', { path: 'worktrees', value: settings });
      if (!result) return undefined;
      await config.refresh();
      return said('Saved worktree settings', result);
    });
  const rerun = (path: string) =>
    act(async () => {
      const result = await run('worktrees.rerun', { project: props.project, checkout: path });
      return result ? said(`Setup completed in ${path}`, result) : undefined;
    });
  const showPreview = (action: WorktreeAction, checkout?: string) =>
    act(async () => {
      const result = await run('worktrees.preview', { project: props.project, action, checkout });
      if (result) setPreview(result);
      return undefined;
    });
  const applyPreview = () =>
    act(async () => {
      if (!preview) return undefined;
      const result = await run('worktrees.apply', {
        project: props.project,
        action: preview.action,
        token: preview.token,
        checkout: preview.action === 'cleanup' ? undefined : preview.paths[0],
      });
      if (!result) return undefined;
      setPreview(null);
      await worktrees.refresh();
      return said(`${preview.action} completed`, result);
    });
  const [branch, setBranch] = useState('');
  const [holder, setHolder] = useState('');
  const [state, setState] = useState<WorktreeRow['state'] | 'all'>('all');
  const visible = (worktrees.data ?? []).filter(
    (row) =>
      (!branch || (row.branch ?? '').toLowerCase().includes(branch.toLowerCase())) &&
      (!holder || row.holders.some((session) => session.id.includes(holder))) &&
      (state === 'all' || row.state === state),
  );
  return (
    <section data-testid="worktrees-workspace" className="space-y-4" aria-label="Worktrees">
      <div className="flex justify-end">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={acting}
          onClick={() => void showPreview('cleanup')}
        >
          Clean stale
        </Button>
        <Button type="button" size="sm" onClick={() => setCreateOpen(true)}>
          <Plus aria-hidden /> New worktree
        </Button>
      </div>
      <details className="rounded-lg border bg-card/40 p-4">
        <summary className="cursor-pointer text-sm font-medium">Worktree settings</summary>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <div className="space-y-1">
            <Label htmlFor="worktree-location">Location</Label>
            <NativeSelect
              id="worktree-location"
              value={settings.location}
              onChange={(event) =>
                setSettings({
                  ...settings,
                  location: event.target.value as Config['worktrees']['location'],
                })
              }
            >
              {(['profile', 'sibling', 'nested', 'custom'] as const).map((location) => (
                <NativeSelectOption key={location} value={location}>
                  {location}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </div>
          {settings.location === 'custom' && (
            <div className="space-y-1">
              <Label htmlFor="worktree-custom-root">Custom root</Label>
              <Input
                id="worktree-custom-root"
                value={settings.customRoot ?? ''}
                onChange={(event) =>
                  setSettings({ ...settings, customRoot: event.target.value || undefined })
                }
                placeholder="/absolute/path/outside/project"
              />
            </div>
          )}
          <div className="space-y-1">
            <Label htmlFor="worktree-base">Default base for new branches</Label>
            <Input
              id="worktree-base"
              value={settings.base ?? ''}
              onChange={(event) =>
                setSettings({ ...settings, base: event.target.value || undefined })
              }
              placeholder="Current branch or origin/HEAD"
            />
          </div>
          <div className="flex items-center gap-2 self-end text-sm">
            <Checkbox
              id="worktree-fetch"
              checked={settings.fetch}
              onCheckedChange={(checked) => setSettings({ ...settings, fetch: checked === true })}
            />
            <Label htmlFor="worktree-fetch">Fetch remotes before creating</Label>
          </div>
          <div className="space-y-1">
            <Label htmlFor="worktree-sparse">Sparse checkout directories, one per line</Label>
            <Textarea
              id="worktree-sparse"
              value={settings.sparseDirectories.join('\n')}
              onChange={(event) =>
                setSettings({
                  ...settings,
                  sparseDirectories: event.target.value
                    .split('\n')
                    .map((line) => line.trim())
                    .filter(Boolean),
                })
              }
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="worktree-carry">Ignored directories to copy, one per line</Label>
            <Textarea
              id="worktree-carry"
              value={settings.carryIgnoredDirectories.join('\n')}
              onChange={(event) =>
                setSettings({
                  ...settings,
                  carryIgnoredDirectories: event.target.value
                    .split('\n')
                    .map((line) => line.trim())
                    .filter(Boolean),
                })
              }
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="worktree-setup">Setup argv, one argument per line</Label>
            <Textarea
              id="worktree-setup"
              value={settings.setup.join('\n')}
              onChange={(event) =>
                setSettings({ ...settings, setup: event.target.value.split('\n').filter(Boolean) })
              }
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="worktree-teardown">Teardown argv, one argument per line</Label>
            <Textarea
              id="worktree-teardown"
              value={settings.teardown.join('\n')}
              onChange={(event) =>
                setSettings({
                  ...settings,
                  teardown: event.target.value.split('\n').filter(Boolean),
                })
              }
            />
          </div>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          Only named ignored directories are copied; none are carried by default.
        </p>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="mt-3"
          disabled={acting || (settings.location === 'custom' && !settings.customRoot)}
          onClick={() => void saveSettings()}
        >
          Save settings
        </Button>
      </details>
      <div className="flex flex-wrap items-center gap-2">
        <Input
          aria-label="Filter worktree branch"
          className="w-44"
          placeholder="Branch"
          value={branch}
          onChange={(event) => setBranch(event.target.value)}
        />
        <Input
          aria-label="Filter worktree holder"
          className="w-44"
          placeholder="Session ID"
          value={holder}
          onChange={(event) => setHolder(event.target.value)}
        />
        <NativeSelect
          aria-label="Filter worktree state"
          value={state}
          onChange={(event) => setState(event.target.value as WorktreeRow['state'] | 'all')}
        >
          {(['all', 'ready', 'locked', 'stale', 'detached', 'recycled'] as const).map((value) => (
            <NativeSelectOption key={value} value={value}>
              {value}
            </NativeSelectOption>
          ))}
        </NativeSelect>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={worktrees.busy}
          onClick={() => void worktrees.refresh()}
        >
          <RefreshCw aria-hidden /> Refresh
        </Button>
      </div>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {visible.map((row) => (
          <article key={row.path} className="min-w-0 rounded-lg border bg-card/40 p-4">
            <div className="flex items-center gap-2">
              <FolderGit2 aria-hidden className="size-4 text-primary" />
              <h3 className="min-w-0 flex-1 truncate font-medium">
                {row.main ? 'main' : (row.branch ?? 'Detached')}
              </h3>
              <Badge variant="outline">{row.state}</Badge>
            </div>
            <p className="mt-2 truncate font-mono text-xs text-muted-foreground" title={row.path}>
              {row.path}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {row.holders.map((session) => (
                <Button
                  key={session.id}
                  type="button"
                  variant="secondary"
                  size="sm"
                  title={`${session.state} at ${session.at}`}
                  onClick={() => props.onSession(session.id)}
                >
                  {session.name ?? session.id}
                </Button>
              ))}
              {!row.holders.length && (
                <span className="text-xs text-muted-foreground">No session holder</span>
              )}
              {!row.main && row.state === 'ready' && config.data?.worktrees.setup.length ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={acting}
                  onClick={() => void rerun(row.path)}
                >
                  Rerun setup
                </Button>
              ) : null}
              {!row.main && (row.state === 'ready' || row.state === 'recycled') ? (
                <>
                  {row.state === 'ready' && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={acting}
                      onClick={() => void showPreview('recycle', row.path)}
                    >
                      Recycle
                    </Button>
                  )}
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={acting}
                    onClick={() => void showPreview('remove', row.path)}
                  >
                    Remove
                  </Button>
                </>
              ) : null}
            </div>
          </article>
        ))}
      </div>
      {!visible.length && !worktrees.busy && (
        <p className="text-sm text-muted-foreground">No worktrees match.</p>
      )}
      {createOpen && (
        <ActionDialog
          testId="worktree-create-dialog"
          title="Create worktree"
          description="Create a branch checkout using this profile's saved worktree settings."
          submit={{ label: 'Create', testId: 'confirm-worktree-create', disabled: acting }}
          onCancel={() => setCreateOpen(false)}
          onSubmit={(form) => {
            const values = new FormData(form);
            void create(
              String(values.get('branch') ?? '').trim(),
              String(values.get('base') ?? '').trim(),
            );
          }}
        >
          <Label htmlFor="new-worktree-branch">Branch</Label>
          <Input
            id="new-worktree-branch"
            name="branch"
            required
            autoFocus
            placeholder="feature/name"
          />
          <Label htmlFor="new-worktree-base">Base (new branch only)</Label>
          <Input id="new-worktree-base" name="base" placeholder={settings.base ?? 'Automatic'} />
        </ActionDialog>
      )}
      {preview && (
        <ActionDialog
          testId="worktree-action-dialog"
          title={`${preview.action} worktree${preview.paths.length === 1 ? '' : 's'}`}
          description="Mesa will recheck this preview immediately before acting."
          submit={{
            label: preview.action,
            testId: 'confirm-worktree-action',
            disabled: acting || !preview.allowed,
          }}
          onCancel={() => setPreview(null)}
          onSubmit={() => void applyPreview()}
        >
          <div className="max-h-64 space-y-2 overflow-auto text-xs">
            {preview.paths.map((path) => (
              <p key={path} className="break-all font-mono">
                {path}
              </p>
            ))}
            {preview.destination && (
              <p className="break-all">Recycle destination: {preview.destination}</p>
            )}
            {preview.branch && (
              <p>
                Branch: {preview.branch} at {preview.head}
              </p>
            )}
            {preview.upstream && (
              <p>
                Upstream: {preview.upstream}, ahead {preview.ahead ?? 0}
              </p>
            )}
            {preview.unpublished && <p>Unpublished branch commits or detached HEAD</p>}
            {preview.teardown?.length ? <p>Teardown argv: {preview.teardown.join(' ')}</p> : null}
            {preview.holders.length > 0 && <p>Session references: {preview.holders.join(', ')}</p>}
            {preview.changes.length > 0 && (
              <p>Changed or untracked: {preview.changes.join(', ')}</p>
            )}
            {preview.ignored.length > 0 && <p>Ignored: {preview.ignored.join(', ')}</p>}
            {preview.reasons.map((reason) => (
              <p key={reason} className="text-destructive">
                {reason}
              </p>
            ))}
            {preview.action === 'remove' && (
              <p>The branch remains. Configured teardown runs first.</p>
            )}
          </div>
        </ActionDialog>
      )}
    </section>
  );
}
