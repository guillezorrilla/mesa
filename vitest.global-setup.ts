import { rmSync } from 'node:fs';
import type { TestProject } from 'vitest/node';

// ponytail: vitest 5.0.2 writes its forks transform cache to `join(tmpdir(), nanoid())` and never
// removes it, about 3 MB a run; drop this file once vitest cleans its `_tmpDir` itself.
export default function setup(project: TestProject) {
  const { _tmpDir } = project.vitest as unknown as { _tmpDir: string };
  return () => rmSync(_tmpDir, { recursive: true, force: true });
}
