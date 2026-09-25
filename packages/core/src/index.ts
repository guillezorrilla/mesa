// The public interface of @mesa/core: the composition root, the real implementations of its
// seams, the result envelope, and the data types callers render. Everything else is internal.
export { AGENT_NAMES, type Agent, DEFAULT_AGENT } from './agents.js';
export { type Clock, systemClock } from './clock.js';
export type { Config } from './config.js';
export type { Check, DoctorReport } from './doctor.js';
export type { Frontmatter, Note } from './frontmatter.js';
export { type IdSource, ulidSource } from './ids.js';
export { createMesa, type Mesa, type MesaDeps } from './mesa.js';
export { macObsidianPaths, type ObsidianPaths, type Opened } from './obsidian.js';
export { type Env, execRunner, type Runner, type RunResult } from './process.js';
export { type ProfileInfo, resolveProfileName } from './profile.js';
export type { Project } from './project-file.js';
export type { ProjectRow } from './projects.js';
export {
  DEFAULT_RECEIPT_LIMIT,
  type Receipt,
  type ReceiptEntry,
  type Recorded,
} from './receipts.js';
export type { RegistryEntry } from './registry.js';
export * from './result.js';
export type { VaultStatus } from './vault.js';
