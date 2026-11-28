import { existsSync } from 'node:fs';
import { z } from 'zod';
import { MesaError } from '../lib/result.js';
import { readYaml, writeYaml } from '../lib/yaml-file.js';
import { type CloudView, CloudViewSchema } from './gcp-config.js';

// Saved views shared as YAML (CONTEXT.md, Cloud Logs): `mesa logs views export|import <file>`.

/** `views` merged into `kept`: a view of a name kept already replaces it, a new one is added. */
export function mergeViews(kept: readonly CloudView[], views: readonly CloudView[]) {
  const names = new Set(views.map((view) => view.name));
  return [...kept.filter((view) => !names.has(view.name)), ...views];
}

/** Writes `views` to `file` as YAML. */
export const exportViews = (file: string, views: readonly CloudView[]) =>
  writeYaml(file, { views });

/** The views a YAML file holds, checked; invalid_config naming the field when one does not read. */
export function importViews(file: string): CloudView[] {
  if (!existsSync(file)) throw new MesaError('not_found', `no file ${file}`);
  return readYaml(file, z.strictObject({ views: z.array(CloudViewSchema) })).views;
}
