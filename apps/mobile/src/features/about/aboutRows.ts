/** What the app knows about itself: its native build and the JavaScript update it runs. */
export type AboutFacts = {
  version: string | null;
  build: string | null;
  runtimeVersion: string | null;
  channel: string | null;
  /** The update running now; none when it runs the bundle the build shipped with. */
  updateId: string | null;
  embedded: boolean;
};

const shortId = (id: string) => id.slice(0, 8);

/** The About screen's rows, so a person can see an over-the-air update arrive (ADR-0027). */
export function aboutRows(facts: AboutFacts): { label: string; value: string }[] {
  const unknown = 'Unknown';
  return [
    { label: 'Version', value: facts.version ?? unknown },
    { label: 'Build', value: facts.build ?? unknown },
    { label: 'Runtime', value: facts.runtimeVersion ? shortId(facts.runtimeVersion) : unknown },
    // A dev build's channel is an empty string, not null.
    { label: 'Channel', value: facts.channel || 'None' },
    {
      label: 'Update',
      value:
        facts.embedded || !facts.updateId ? 'Shipped with this build' : shortId(facts.updateId),
    },
  ];
}
