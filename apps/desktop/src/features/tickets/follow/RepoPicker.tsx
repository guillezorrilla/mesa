import { BookMarked, Check, ChevronDown, Loader2, Plus } from 'lucide-react';
import { useState } from 'react';
import { GiveAccessLink } from '../github/GiveAccessLink';
import type { useRepoAccess } from '../github/useRepoAccess';
import { StepLabel } from './StepLabel';

type Access = ReturnType<typeof useRepoAccess>;

/** What a repo's row says beside its name: the project's remote, or one just given access to. */
const tagOf = (access: Access, repo: { fullName: string; origin: boolean }) =>
  access.status.step === 'added' && access.status.repos.includes(repo.fullName)
    ? 'Just added'
    : repo.origin
      ? "This project's remote"
      : '';

/**
 * A GitHub Follow dialog's first step: the repo, the project's origin remote first, from those
 * Mesa's GitHub App reads, and under it giving Mesa access to more on GitHub.
 */
export function RepoPicker(props: {
  access: Access;
  repo: string | undefined;
  onPick: (repo: string) => void;
}) {
  const { access } = props;
  const [open, setOpen] = useState(false);
  const repos = access.repos ?? [];
  const picked = repos.find((r) => r.fullName === props.repo);
  const tag = picked && tagOf(access, picked);
  const give = (text: string) => (
    <GiveAccessLink href={access.install} onOpen={access.start}>
      {text}
    </GiveAccessLink>
  );
  const note = {
    idle: repos.length ? (
      <>
        Mesa can read {repos.length} of your repo{repos.length === 1 ? '' : 's'}.{' '}
        {give('Made a new repo? Give Mesa access on GitHub')}
      </>
    ) : (
      <>Mesa can't read any repos yet. {give('Give Mesa access on GitHub')}</>
    ),
    waiting: (
      <>
        <Loader2 aria-hidden className="size-3.5 animate-spin" /> Finish on GitHub: tick the repos
        Mesa may read, then come back here.
      </>
    ),
    added: (
      <>
        <Check aria-hidden className="size-3.5 text-state-idle" /> Mesa can now read{' '}
        {access.status.step === 'added' ? access.status.repos.join(', ') : ''}; it's picked above.{' '}
        {give('More repos')}
      </>
    ),
    none: <>Mesa can't read any new repos yet. {give('Try again')}</>,
  }[access.status.step];
  return (
    <div className="grid gap-2">
      <StepLabel step={1}>Repository</StepLabel>
      <button
        type="button"
        aria-expanded={open}
        data-testid="repo-button"
        disabled={!repos.length}
        onClick={() => setOpen(!open)}
        className="flex h-9 w-full items-center gap-2 rounded-md border border-input bg-card px-2.5 text-left text-sm disabled:opacity-60"
      >
        <BookMarked aria-hidden className="size-3.5 text-muted-foreground" />
        <span className="truncate">
          {props.repo ?? (access.repos ? 'No repo yet' : 'Reading repos...')}
        </span>
        {tag && (
          <span className="rounded-full border px-2 text-[11.5px] text-muted-foreground">
            {tag}
          </span>
        )}
        <ChevronDown aria-hidden className="ml-auto size-3.5 text-muted-foreground" />
      </button>
      {open && (
        <div
          role="radiogroup"
          aria-label="Repository"
          className="max-h-44 overflow-auto rounded-lg border"
        >
          {repos.map((repo) => (
            <label
              key={repo.fullName}
              className="flex cursor-pointer items-center gap-2.5 border-b px-3 py-2 text-sm hover:bg-accent/60"
            >
              <input
                type="radio"
                name="github-repo"
                value={repo.fullName}
                checked={repo.fullName === props.repo}
                onChange={() => {
                  props.onPick(repo.fullName);
                  setOpen(false);
                }}
                className="accent-primary"
              />
              {repo.fullName}
              <span className="ml-auto text-xs text-muted-foreground">{tagOf(access, repo)}</span>
            </label>
          ))}
          <div className="flex items-center gap-1.5 px-3 py-2 text-sm">
            <Plus aria-hidden className="size-3" />
            {give('Give Mesa access to more repos')}
          </div>
        </div>
      )}
      <p
        role="status"
        className="m-0 flex flex-wrap items-center gap-1.5 text-[12.5px] text-muted-foreground"
      >
        {note}
      </p>
    </div>
  );
}
