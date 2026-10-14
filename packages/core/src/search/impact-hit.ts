// An Impact search hit's id: the project or the session whose Impact it opens. Pure, so the app
// bundles it (`@mesa/core/browser`) to read what core wrote.

export type ImpactScope = { project: string } | { session: string };

export const impactHitId = (scope: ImpactScope) =>
  'project' in scope ? `project:${scope.project}` : `session:${scope.session}`;

/** The scope an Impact hit's id names. */
export function impactHitScope(id: string): ImpactScope {
  const at = id.indexOf(':');
  const value = id.slice(at + 1);
  return id.slice(0, at) === 'project' ? { project: value } : { session: value };
}
