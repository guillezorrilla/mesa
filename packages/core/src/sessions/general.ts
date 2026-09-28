/** Reserved outside project slugs, so General has no registered project or mesa.yaml. */
export const GENERAL_PROJECT = '__mesa_general__';
export const projectLabel = (project: string | null) =>
  project === GENERAL_PROJECT || project === null ? 'General' : project;
export const projectScope = (project: string) =>
  project === GENERAL_PROJECT ? undefined : project;
