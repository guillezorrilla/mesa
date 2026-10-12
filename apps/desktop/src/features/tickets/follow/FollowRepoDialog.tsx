import type { ViewQuery } from '@mesa/core';
import { useEffect, useState } from 'react';
import { useRepoAccess } from '../github/useRepoAccess';
import type { FollowDialogProps } from '../trackers';
import { FollowDialogFrame } from './FollowDialogFrame';
import { RepoFilters } from './RepoFilters';
import { RepoPicker } from './RepoPicker';
import { useFollowView } from './useFollowView';

/**
 * GitHub's Follow dialog, "Follow a repo": the repo (this project's remote first, or one just
 * given access to), then optional label and milestone filters, with Only issues assigned to me,
 * Hide closed issues, and the live count. The followed repo is a view named after the repo.
 */
export function FollowRepoDialog(props: FollowDialogProps) {
  const access = useRepoAccess(props.project);
  const [picked, setPicked] = useState<string>();
  const [labels, setLabels] = useState<string[]>([]);
  const [milestone, setMilestone] = useState<string>();
  const pick = (repo: string) => {
    setPicked(repo);
    setLabels([]);
    setMilestone(undefined);
  };
  // A repo given access to just now is picked.
  const added = access.status.step === 'added' ? access.status.repos[0] : undefined;
  useEffect(() => {
    if (!added) return;
    setPicked(added);
    setLabels([]);
    setMilestone(undefined);
  }, [added]);
  const repo = picked ?? access.repos?.[0]?.fullName;
  const query: ViewQuery | undefined = repo
    ? {
        provider: 'github',
        repo,
        ...(labels.length ? { labels } : {}),
        ...(milestone ? { milestone } : {}),
      }
    : undefined;
  const { view, name, acting, follow, toggles } = useFollowView(
    props.project,
    props.onFollowed,
    query,
    repo?.split('/')[1] ?? 'repo',
  );
  return (
    <FollowDialogFrame
      tracker="github"
      title="Follow a repo"
      description="Its issues show up in this tab. Pull requests are left out."
      view={view}
      name={name}
      words={{
        nouns: 'issues',
        query: 'the request Mesa sends',
        extra: ', pull requests left out',
      }}
      waiting={access.repos ? 'Give Mesa access to a repo first.' : 'Reading repos...'}
      labels={{ mine: 'Only issues assigned to me', hideDone: 'Hide closed issues' }}
      {...toggles}
      disabled={acting || !view}
      onSubmit={() => follow()}
      onCancel={props.onCancel}
    >
      <RepoPicker access={access} repo={repo} onPick={pick} />
      {repo && (
        <RepoFilters
          repo={repo}
          labels={labels}
          milestone={milestone}
          onLabels={setLabels}
          onMilestone={setMilestone}
        />
      )}
    </FollowDialogFrame>
  );
}
