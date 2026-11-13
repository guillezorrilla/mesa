import type { CallResult } from '@mesa/core/phone';
import { use } from 'react';
import { RefreshControl, ScrollView } from 'react-native';
import { BusyLine } from '@/components/BusyLine';
import { ErrorNote } from '@/components/ErrorNote';
import type { MacRead } from '../mac/tryCall';
import { ChecksSection } from './ChecksSection';
import { DescriptionSection } from './DescriptionSection';
import { DraftsSection } from './DraftsSection';
import { FilesLink } from './FilesLink';
import { PrHeader } from './PrHeader';
import { ReviewSection } from './ReviewSection';
import { ThreadsSection } from './ThreadsSection';
import type { usePrActions } from './usePrActions';

/** The PR read, top to bottom in the order a person ships it: its size and files, then checks
 *  and merge. */
export function PrBody({
  answer,
  refreshing,
  onRefresh,
  actions,
}: {
  answer: Promise<MacRead<CallResult<'pr'>>>;
  refreshing: boolean;
  onRefresh: () => void;
  actions: ReturnType<typeof usePrActions>;
}) {
  const { result: pr, error } = use(answer);
  return (
    <ScrollView
      className="flex-1 bg-background"
      contentContainerClassName="gap-6 p-4 pb-12"
      contentInsetAdjustmentBehavior="automatic"
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      {error ? <ErrorNote text={error} /> : null}
      {actions.busy ? <BusyLine label={`${actions.busy}...`} /> : null}
      {pr ? (
        <>
          <PrHeader pr={pr} />
          <FilesLink pr={pr} />
          <ChecksSection
            pr={pr}
            onSend={actions.send}
            onMerge={() => actions.merge(pr)}
            busy={Boolean(actions.busy)}
          />
          <ReviewSection pr={pr} onReview={() => actions.review(pr)} busy={Boolean(actions.busy)} />
          <DescriptionSection body={pr.body} />
          <ThreadsSection
            threads={pr.threads}
            onReply={actions.reply}
            onResolve={actions.resolve}
            canResolve={pr.provider === 'github'}
            busy={Boolean(actions.busy)}
          />
          <DraftsSection
            drafts={pr.drafts}
            onDiscard={actions.discard}
            busy={Boolean(actions.busy)}
          />
        </>
      ) : null}
    </ScrollView>
  );
}
