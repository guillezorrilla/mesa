import type { ViewQuery } from '@mesa/core';
import { useEffect, useState } from 'react';
import { useAct } from '@/lib/useAct';
import { useCommand, useRun } from '@/lib/useCommand';
import { useRepoAccess } from '../github/useRepoAccess';
import type { FollowDialogProps } from '../trackers';
import { FollowDialogFrame } from './FollowDialogFrame';
import { freeName } from './freeName';
import { RepoFilters } from './RepoFilters';
import { RepoPicker } from './RepoPicker';

/**
 * GitHub's Follow dialog, "Follow a repo": the repo (this project's remote first, or one just
 * given access to), then optional label and milestone filters, with Only issues assigned to me,
 * Hide closed issues, and the live count. The followed repo is a view named after the repo.
 */
export function FollowRepoDialog(props: FollowDialogProps) {
  const run = useRun();
  const { acting, act } = useAct();
  const views = useCommand('tickets.views');
  const access = useRepoAccess(props.project);
  const [picked, setPicked] = useState<string>();
  const [labels, setLabels] = useState<string[]>([]);
  const [milestone, setMilestone] = useState<string>();
  const [mine, setMine] = useState(true);
  const [hideDone, setHideDone] = useState(true);
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
  const view: ViewQuery | undefined = repo
    ? {
        provider: 'github',
        repo,
        ...(labels.length ? { labels } : {}),
        ...(milestone ? { milestone } : {}),
        ...(mine ? {} : { everyone: true }),
        ...(hideDone ? {} : { showDone: true }),
      }
    : undefined;
  const name = freeName(
    repo?.split('/')[1] ?? 'repo',
    (views.data ?? []).map((v) => v.name),
  );
  const follow = () =>
    void act(async () => {
      const followed = view && (await run('tickets.viewsAdd', { view: { name, ...view } }));
      if (
        followed &&
        (await run('tickets.follow', { project: props.project, view: followed.name }))
      )
        props.onFollowed();
      return undefined;
    });
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
      mine={mine}
      hideDone={hideDone}
      onMine={setMine}
      onHideDone={setHideDone}
      disabled={acting || !view}
      onSubmit={follow}
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
