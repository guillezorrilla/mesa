import type {
  BrowserAnnotationInput,
  BrowserAnnotationPreview,
  ChangeReview,
  ChangeReviewInput,
  ChangeReviewPreview,
  ResponseReviewPreview,
  ReviewDelivery,
  SessionResponses,
} from '@mesa/core';
import { commandWith } from './spec';

type ReviewSelection = {
  id: string;
  profile: string;
  source: string;
  revision: string;
  start: number;
  end: number;
  comment: string;
};
const reviewFlags = (selection: ReviewSelection) => [
  '--source',
  selection.source,
  '--revision',
  selection.revision,
  '--selection-profile',
  selection.profile,
  '--start',
  String(selection.start),
  '--end',
  String(selection.end),
  `--comment=${selection.comment}`,
];
type ChangeSelection = ChangeReviewInput & { id: string };
type BrowserSelection = BrowserAnnotationInput & { id: string };
const browserSelectionFlags = (selection: Omit<BrowserSelection, 'comment'>) => [
  `--url=${selection.url}`,
  `--title=${selection.title}`,
  `--selector=${selection.selector}`,
  `--text=${selection.text}`,
  `--selection-profile=${selection.profile}`,
];
const browserFlags = (selection: BrowserSelection) => [
  ...browserSelectionFlags(selection),
  `--comment=${selection.comment}`,
];
const changeFlags = (selection: ChangeSelection) => [
  `--path=${selection.path}`,
  ...(selection.staged ? ['--staged'] : []),
  '--source',
  selection.source,
  '--revision',
  selection.revision,
  '--selection-profile',
  selection.profile,
  '--hunk',
  String(selection.hunk),
  `--comment=${selection.comment}`,
];

/** Review commands: a response, a change, or a page in the browser panel, sent to a session. */
export const reviewCommands = {
  'browser.external': commandWith<{ url: string }, { url: string; opened: true }>(({ url }) => [
    'browser',
    'external',
    '--',
    url,
  ]),
  'review.responses': commandWith<{ id: string }, SessionResponses>(({ id }) => [
    'review',
    'responses',
    '--',
    id,
  ]),
  'review.changes': commandWith<{ id: string; path: string; staged?: boolean }, ChangeReview>(
    ({ id, path, staged }) => [
      'review',
      'changes',
      ...(staged ? ['--staged'] : []),
      '--',
      id,
      path,
    ],
  ),
  'review.changePreview': commandWith<ChangeSelection, ChangeReviewPreview>((selection) => [
    'review',
    'change-preview',
    ...changeFlags(selection),
    '--',
    selection.id,
  ]),
  'review.changeSend': commandWith<ChangeSelection & { yes?: boolean }, ReviewDelivery>(
    (selection) => [
      'review',
      'change-send',
      '--no-from',
      ...changeFlags(selection),
      ...(selection.yes ? ['--yes'] : []),
      '--',
      selection.id,
    ],
  ),
  'browser.annotatePreview': commandWith<BrowserSelection, BrowserAnnotationPreview>(
    (selection) => ['browser', 'annotate-preview', ...browserFlags(selection), '--', selection.id],
  ),
  'browser.select': commandWith<
    Omit<BrowserSelection, 'comment'> & { ownerPid: number; ownerSocket: string },
    { source: string; revision: string }
  >((selection) => [
    'browser',
    'select',
    ...browserSelectionFlags(selection),
    '--owner-pid',
    String(selection.ownerPid),
    '--owner-socket',
    selection.ownerSocket,
    '--',
    selection.id,
  ]),
  'browser.clear': commandWith<{ id: string }, { cleared: boolean }>(({ id }) => [
    'browser',
    'clear',
    '--',
    id,
  ]),
  'browser.annotateSend': commandWith<
    BrowserSelection & { source: string; revision: string; yes?: boolean },
    ReviewDelivery
  >((selection) => [
    'browser',
    'annotate-send',
    '--no-from',
    ...browserFlags(selection),
    '--source',
    selection.source,
    '--revision',
    selection.revision,
    ...(selection.yes ? ['--yes'] : []),
    '--',
    selection.id,
  ]),
  'review.preview': commandWith<ReviewSelection, ResponseReviewPreview>((selection) => [
    'review',
    'preview',
    ...reviewFlags(selection),
    '--',
    selection.id,
  ]),
  'review.send': commandWith<ReviewSelection & { yes?: boolean }, ReviewDelivery>((selection) => [
    'review',
    'send',
    '--no-from',
    ...reviewFlags(selection),
    ...(selection.yes ? ['--yes'] : []),
    '--',
    selection.id,
  ]),
};
