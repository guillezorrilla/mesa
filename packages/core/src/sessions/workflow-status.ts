/** User-managed work progress, separate from Faro's observation of the agent process. */
export const WORKFLOW_STATUSES = ['todo', 'in-progress', 'review', 'done'] as const;
export type WorkflowStatus = (typeof WORKFLOW_STATUSES)[number];
