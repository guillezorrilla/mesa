import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

// A project's modules (CONTEXT.md, Logs panel): the services the IntelliJ steps offer by name.

/** The build files that make a folder one of a project's modules. */
const MODULE_FILES = ['build.gradle', 'build.gradle.kts', 'pom.xml', 'package.json'];

/**
 * The project's modules: its top-level folders with a Gradle, Maven or npm build file, by name;
 * what the IntelliJ steps offer as service names.
 */
export function projectModules(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .filter(
      (entry) =>
        entry.isDirectory() &&
        !entry.name.startsWith('.') &&
        entry.name !== 'node_modules' &&
        MODULE_FILES.some((build) => existsSync(join(dir, entry.name, build))),
    )
    .map((entry) => entry.name)
    .sort();
}
