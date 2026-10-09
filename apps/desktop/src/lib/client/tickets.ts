import type { Board, Filter, FollowedView, Ticket, TicketView, ViewInput } from '@mesa/core';
import { command, commandWith } from './spec';

type ListedView = TicketView & { describe: string; following: string[] };
type Follows = { project: string; following: string[] };
type SiteOf<T> = { site: { id: string; name: string } } & T;

/** `--search q` when there is a query. */
const searchFlag = (search?: string) => (search?.trim() ? ['--search', search.trim()] : []);

/** The Tickets tab's commands (CONTEXT.md, Ticket view). */
export const ticketsCommands = {
  'tickets.list': commandWith<
    { project: string },
    {
      project: string;
      prompt: string | null;
      projectPrompt: string | null;
      views: FollowedView[];
      tickets: Ticket[];
    }
  >(({ project }) => ['tickets', '--', project]),
  'tickets.views': command<ListedView[]>('tickets', 'views'),
  'tickets.viewsAdd': commandWith<{ view: ViewInput }, TicketView & { describe: string }>(
    ({ view }) => [
      'tickets',
      'views',
      'add',
      ...(view.board !== undefined ? ['--board', String(view.board)] : []),
      ...(view.sprint ? ['--sprint', view.sprint] : []),
      ...(view.filter !== undefined ? ['--filter', view.filter] : []),
      ...(view.jql !== undefined ? ['--jql', view.jql] : []),
      ...(view.everyone ? ['--everyone'] : []),
      ...(view.showDone ? ['--show-done'] : []),
      '--',
      view.name,
    ],
  ),
  'tickets.follow': commandWith<{ project: string; view: string }, Follows>(({ project, view }) => [
    'tickets',
    'follow',
    '--',
    project,
    view,
  ]),
  'tickets.unfollow': commandWith<{ project: string; view: string }, Follows>(
    ({ project, view }) => ['tickets', 'unfollow', '--', project, view],
  ),
  'tickets.prompt': commandWith<
    { name?: string; project?: string },
    { project: string | null; prompt: string | null }
  >(({ name, project }) => [
    'tickets',
    'prompt',
    ...(project ? ['--project', project] : []),
    ...(name ? ['--', name] : ['--clear']),
  ]),
  'tickets.boards': commandWith<{ search?: string }, SiteOf<{ boards: Board[] }>>(({ search }) => [
    'tickets',
    'boards',
    ...searchFlag(search),
  ]),
  'tickets.filters': commandWith<{ search?: string }, SiteOf<{ filters: Filter[] }>>(
    ({ search }) => ['tickets', 'filters', ...searchFlag(search)],
  ),
};
