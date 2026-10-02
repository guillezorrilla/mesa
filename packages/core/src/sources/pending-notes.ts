import { existsSync } from 'node:fs';
import { z } from 'zod';
import { lockedBy, withLockSync } from '../lib/lock-file.js';
import { readYaml, writeYaml } from '../lib/yaml-file.js';

const schema = z.array(z.strictObject({ project: z.string(), url: z.string().url() }));

/** Notes still owed by change-aware refresh, independent of a source's snapshot revision. */
export function pendingImportNotes(file: string) {
  const read = () => (existsSync(file) ? readYaml(file, schema) : []);
  const change = (project: string, urls: readonly string[], add: boolean) => {
    if (!urls.length) return;
    const lock = `${file}.lock`;
    withLockSync(
      lock,
      () => {
        const all = read();
        const pending = new Set(all.filter((r) => r.project === project).map((r) => r.url));
        for (const url of urls) add ? pending.add(url) : pending.delete(url);
        writeYaml(
          file,
          [
            ...all.filter((r) => r.project !== project),
            ...[...pending].map((url) => ({ project, url })),
          ],
          { mode: 0o600 },
        );
      },
      () => lockedBy('pending import notes', lock, 'another refresh'),
    );
  };
  return {
    list: (project: string) =>
      new Set(
        read()
          .filter((r) => r.project === project)
          .map((r) => r.url),
      ),
    add: (project: string, urls: readonly string[]) => change(project, urls, true),
    complete: (project: string, urls: readonly string[]) => change(project, urls, false),
  };
}
