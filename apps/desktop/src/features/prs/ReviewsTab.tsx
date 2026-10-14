import type { PrSetupRow } from '@mesa/core';
import { Muted } from '@/components/Muted';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { CheckedLine } from './CheckedLine';
import { projectList } from './prGroups';
import { ReviewsList } from './ReviewsList';
import { usePrs } from './usePrs';

type Prs = Pick<ReturnType<typeof usePrs>, 'list' | 'readAt'>;
type Props = {
  project: string;
  /** The app's list of every project; without it (or with All open PRs on) the tab reads its own. */
  shared?: Prs;
  all: boolean;
  onAll: (all: boolean) => void;
  onSetup: (row: PrSetupRow) => void;
};

/**
 * A project's Reviews tab: its open PRs grouped by status. The ones for me come from the app's
 * list, so opening a project reads nothing; All open PRs reads the project's own.
 */
export function ReviewsTab(props: Props) {
  return (
    <div data-testid="reviews-tab" className="max-w-2xl space-y-4">
      {props.all || !props.shared ? <OwnRead {...props} /> : <Body {...props} prs={props.shared} />}
    </div>
  );
}

/** The project's own read, mounted only when the app's list cannot serve. */
function OwnRead(props: Props) {
  const prs = usePrs({ project: props.project, ...(props.all ? { all: true } : {}) });
  return <Body {...props} prs={prs} />;
}

function Body(props: Props & { prs: Prs }) {
  const { list } = props.prs;
  const now = Date.now();
  return (
    <>
      <div className="flex items-center gap-3">
        <Switch id="reviews-all" checked={props.all} onCheckedChange={props.onAll} />
        <Label htmlFor="reviews-all">All open PRs</Label>
        <CheckedLine prs={props.prs} now={now} className="ml-auto" />
      </div>
      {list.data ? (
        <ReviewsList
          list={projectList(list.data, props.project)}
          by="status"
          onSetup={props.onSetup}
          now={now}
        />
      ) : (
        <Muted>{list.error ? list.error.message : 'Reading pull requests...'}</Muted>
      )}
    </>
  );
}
