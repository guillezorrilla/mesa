import { z } from 'zod';
import { RELEASES_PAGE } from '../update/feeds.js';

const REPOSITORY = 'https://github.com/guillezorrilla/mesa';

/** Where an attribution's package comes from: the executable's Node, npm, a Rust crate, a skill. */
export const ATTRIBUTION_SOURCES = ['node', 'npm', 'crate', 'skill'] as const;

/** `scripts/release/licenses.mjs`'s output: one entry per third-party package a release ships. */
const AttributionsSchema = z.array(
  z.object({
    name: z.string(),
    version: z.string(),
    license: z.string().min(1),
    source: z.enum(ATTRIBUTION_SOURCES),
    text: z.string(),
  }),
);
export type Attribution = z.infer<typeof AttributionsSchema>[number];

/** What a release's single executable carries beside its version (ADR-0017): assets `build` and `attributions.json`. */
export type ReleaseBuild = {
  /** The build number: the commit count build.sh also writes as the app's bundleVersion. */
  build: string;
  /** The attributions file's JSON, read only when asked for. */
  attributions: () => string;
};

export type About = {
  version: string;
  /** The build number, or `dev` outside a release. */
  build: string;
  license: 'MIT';
  links: { docs: string; support: string; releases: string };
  attributions: Attribution[];
  /** Why `attributions` is empty, when it is. */
  note?: string;
};

/** Mesa's version, build, links and the third-party attributions of what it ships (#478). */
export function about(version: string, release: ReleaseBuild | undefined): About {
  const known = {
    version,
    license: 'MIT' as const,
    links: {
      docs: `${REPOSITORY}#readme`,
      support: `${REPOSITORY}/issues`,
      releases: RELEASES_PAGE,
    },
  };
  if (!release) {
    return {
      ...known,
      build: 'dev',
      attributions: [],
      note: 'A development build carries no attributions; node scripts/release/licenses.mjs <file> writes them.',
    };
  }
  try {
    const attributions = AttributionsSchema.parse(JSON.parse(release.attributions()));
    return { ...known, build: release.build, attributions };
  } catch {
    return {
      ...known,
      build: release.build,
      attributions: [],
      note: "This build's attributions file does not read.",
    };
  }
}
