import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
} from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';
import type { MesaContext } from '../context.js';
import { writeFileAtomic } from '../lib/atomic-file.js';
import { MesaError } from '../lib/result.js';
import { parseWith } from '../lib/schema.js';
import { writeYaml } from '../lib/yaml-file.js';
import { parseRegistryEntries, readRegistry } from '../projects/registry.js';
import { parseSavedPrompts, promptsService } from '../prompts/prompts.js';
import { buildBackupSettings, buildConfig, CONFIG_HEADER } from './config.js';
import { profilesDir } from './paths.js';

const RETAIN = 5;
const MAX_BYTES = 10_000_000;
const ArchiveSchema = z.strictObject({
  version: z.literal(1),
  createdAt: z.iso.datetime(),
  settings: z.unknown(),
  projects: z.unknown(),
  prompts: z.unknown(),
});

/** Local backup of portable profile data. Credentials, vault, sessions, logs and tmux stay out. */
export function backupService(ctx: MesaContext) {
  const create = () => {
    const { vault: _vault, keys: _keys, ...settings } = ctx.open().config;
    const archive = {
      version: 1,
      createdAt: ctx.deps.clock().toISOString(),
      settings,
      projects: readRegistry(ctx.paths.registry),
      prompts: promptsService(ctx).list(),
    };
    mkdirSync(ctx.paths.backups, { recursive: true, mode: 0o700 });
    const name = `backup-${archive.createdAt.replaceAll(':', '-')}-${ctx.deps.newId()}.json`;
    const path = join(ctx.paths.backups, name);
    writeFileAtomic(path, JSON.stringify(archive), 0o600);
    const archives = readdirSync(ctx.paths.backups)
      .filter((entry) => /^backup-.*\.json$/.test(entry))
      .sort();
    for (const old of archives.slice(0, -RETAIN)) rmSync(join(ctx.paths.backups, old));
    return { path, createdAt: archive.createdAt, retained: RETAIN };
  };
  const restore = (input: string, vaultInput: string) => {
    const archiveFile = ctx.absolute(input);
    const vault = ctx.absolute(vaultInput);
    if (!/^[A-Za-z0-9_-]{1,64}$/.test(ctx.profile))
      throw new MesaError('usage', 'restore needs a simple new profile name');
    if (existsSync(ctx.paths.root))
      throw new MesaError('usage', `profile ${ctx.profile} already exists; choose a new profile`);
    if (existsSync(vault))
      throw new MesaError('usage', 'restore needs a new vault path that does not exist');
    const source = statSync(archiveFile, { throwIfNoEntry: false });
    if (!source?.isFile()) throw new MesaError('not_found', `${archiveFile}: backup not found`);
    if (source.size > MAX_BYTES)
      throw new MesaError('invalid_config', `${archiveFile}: backup exceeds 10 MB`);
    let raw: unknown;
    try {
      raw = JSON.parse(readFileSync(archiveFile, 'utf8'));
    } catch {
      throw new MesaError('invalid_config', `${archiveFile}: not valid JSON`);
    }
    const archive = parseWith(ArchiveSchema, raw, archiveFile);
    const settings = buildBackupSettings(archive.settings, archiveFile);
    const projects = parseRegistryEntries(archive.projects, archiveFile);
    const prompts = parseSavedPrompts(archive.prompts, archiveFile);
    const config = buildConfig({ ...settings, vault, keys: {} }, archiveFile);
    const parent = profilesDir(ctx.deps.home);
    mkdirSync(parent, { recursive: true, mode: 0o700 });
    const stage = mkdtempSync(join(parent, '.restore-'));
    chmodSync(stage, 0o700);
    try {
      writeYaml(join(stage, 'config.yaml'), config, { header: CONFIG_HEADER, mode: 0o600 });
      writeYaml(join(stage, 'registry.yaml'), { projects }, { mode: 0o600 });
      writeFileAtomic(join(stage, 'prompts.json'), JSON.stringify(prompts), 0o600);
      renameSync(stage, ctx.paths.root);
    } catch (error) {
      rmSync(stage, { recursive: true, force: true });
      throw error;
    }
    return {
      profile: ctx.profile,
      path: ctx.paths.root,
      vault,
      projects: projects.length,
      prompts: prompts.length,
    };
  };
  return { create, restore };
}
