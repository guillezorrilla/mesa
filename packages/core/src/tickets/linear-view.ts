import { z } from 'zod';

// A Linear ticket view as tickets.yaml keeps it (CONTEXT.md, Ticket view): a team's current or
// next cycle (found again each read, so it moves to the next cycle on its own), a project, or a
// custom view, narrowed to the person's issues not completed or canceled unless it says not.

export const LinearViewSchema = z
  .strictObject({
    name: z.string().trim().min(1).max(60),
    provider: z.literal('linear'),
    /** A cycle view's team, by id. */
    team: z.string().min(1).optional(),
    /** The team's key and name, kept to show them. */
    teamKey: z.string().optional(),
    teamName: z.string().optional(),
    cycle: z.enum(['current', 'next']).optional(),
    /** A project view's project, by id. */
    project: z.string().min(1).optional(),
    projectName: z.string().optional(),
    /** A custom view, by id. */
    customView: z.string().min(1).optional(),
    customViewName: z.string().optional(),
    /** Every assignee's issues, not only the person's. */
    everyone: z.boolean().optional(),
    /** Completed and canceled issues too. */
    showDone: z.boolean().optional(),
  })
  .refine(
    (v) => [v.team, v.project, v.customView].filter((q) => q !== undefined).length === 1,
    'a Linear view names exactly one of a team, a project, or a custom view',
  )
  .refine((v) => v.cycle === undefined || v.team !== undefined, 'only a team view has a cycle');
export type LinearView = z.infer<typeof LinearViewSchema>;

/**
 * What `mesa tickets views add --provider linear` takes: a team by its key or id (its current
 * cycle unless it says next), a project by its id, slug or link, or a custom view by its id or
 * link.
 */
export type LinearViewInput = Pick<
  LinearView,
  'name' | 'team' | 'cycle' | 'project' | 'customView' | 'everyone' | 'showDone'
> & { provider: 'linear' };

/**
 * `view` in a line, as the view switcher's second line shows it: what it follows, then whose, and
 * completed too.
 */
export function describeLinearView(view: LinearView): string {
  const what =
    view.team !== undefined
      ? `${view.teamName ?? view.teamKey ?? view.team}, ${view.cycle === 'next' ? 'next' : 'current'} cycle`
      : view.project !== undefined
        ? `Project ${view.projectName ?? view.project}`
        : `Saved view ${view.customViewName ?? view.customView}`;
  return [
    what,
    ...(view.everyone ? [] : ['assigned to me']),
    ...(view.showDone ? ['completed too'] : []),
  ].join(', ');
}
