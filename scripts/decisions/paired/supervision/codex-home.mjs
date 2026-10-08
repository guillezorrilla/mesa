// The temporary CODEX_HOME Board placement's paired workflows run Codex with (#677): a copy of the
// login (the real ~/.codex is only read, never written), no hooks.json, so Mesa's hooks are
// silent, the project trusted, one `prompt` rule so Codex asks before the policy command, and the
// person's own skills, apps and plugins off, so a session sees only the invented project and what
// its screen shows (and the model reads) is the task alone.
import { chmodSync, copyFileSync, mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { POLICY_COMMAND } from './material.mjs';

/** Every SKILL.md under `dir` (symbolic links followed), `depth` folders down at most. */
function skillFiles(dir, depth = 4) {
  let names;
  try {
    names = readdirSync(dir);
  } catch {
    return [];
  }
  return names.flatMap((name) => {
    const path = join(dir, name);
    if (name === 'SKILL.md') return [path];
    try {
      return depth > 1 && statSync(path).isDirectory() ? skillFiles(path, depth - 1) : [];
    } catch {
      return [];
    }
  });
}

/** Codex's config: updates unchecked, `projectDir` trusted, `skills` turned off, no apps or plugins. */
export function codexConfig(projectDir, skills) {
  const off = skills.map(
    (path) => `\n[[skills.config]]\npath = ${JSON.stringify(path)}\nenabled = false\n`,
  );
  return `check_for_update_on_startup = false\n\n[features]\napps = false\nplugins = false\n\n[projects.${JSON.stringify(projectDir)}]\ntrust_level = "trusted"\n${off.join('')}`;
}

/** Writes the temporary CODEX_HOME at `dir` for project `projectDir`, from the person's `home`. */
export function writeCodexHome(dir, { home, projectDir }) {
  mkdirSync(join(dir, 'rules'), { recursive: true });
  copyFileSync(join(home, '.codex', 'auth.json'), join(dir, 'auth.json'));
  chmodSync(join(dir, 'auth.json'), 0o600);
  const skills = skillFiles(join(home, '.agents', 'skills'));
  writeFileSync(join(dir, 'config.toml'), codexConfig(projectDir, skills));
  writeFileSync(
    join(dir, 'rules', 'default.rules'),
    `prefix_rule(pattern=${JSON.stringify(POLICY_COMMAND)}, decision="prompt")\n`,
  );
}
