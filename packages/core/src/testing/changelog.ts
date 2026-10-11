/**
 * An invented CHANGELOG.md: 0.1.2 to 0.1.9 and a beta of 0.1.9 in the Keep a Changelog style,
 * each with one note added and two fixed, then 0.1.1 in the style before change files.
 */
export const TEST_CHANGELOG = [
  '# Changelog',
  ...['0.1.9', '0.1.9-beta.1', '0.1.8', '0.1.7', '0.1.6', '0.1.5', '0.1.4', '0.1.3', '0.1.2'].map(
    (v) =>
      `## ${v} - 2026-10-05\n\n### Added\n\n- Tide charts in ${v}. (#1)\n\n### Fixed\n\n- Kelp sync in ${v}. (#2)\n- Reef scroll in ${v}. (#3)\n`,
  ),
  '## 0.1.1 - 2026-10-04\n\n### Features\n\n- **app**: lantern board (#4)\n\n### Other\n\n- **docs**: a readme (#5)\n',
].join('\n\n');
