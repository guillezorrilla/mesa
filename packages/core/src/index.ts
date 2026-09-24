// The public interface of @mesa/core: the composition root, the real implementations of its
// seams, the result envelope, and the data types callers render. Everything else is internal.
export { AGENT_NAMES, type Agent, DEFAULT_AGENT } from './agents.js';
export type { Config } from './config.js';
export {
  type Check,
  type DoctorReport,
  OBSIDIAN_PATHS,
  type ObsidianPaths,
} from './doctor.js';
export { createMesa, type Mesa, type MesaDeps } from './mesa.js';
export { type Env, execRunner, type Runner, type RunResult } from './process.js';
export { type ProfileInfo, resolveProfileName } from './profile.js';
export type { Project } from './project-file.js';
export type { ProjectRow } from './projects.js';
export type { RegistryEntry } from './registry.js';
export * from './result.js';
