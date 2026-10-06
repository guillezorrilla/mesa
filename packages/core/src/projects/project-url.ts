import { MesaError } from '../lib/result.js';
import { slugify } from '../lib/slug.js';

export type RepositoryUrl = { url: string; slug: string };

/** Accept a Git HTTPS/SSH URL or a mesa://clone?url= deep link, never file paths or credentials. */
export function repositoryUrl(input: string): RepositoryUrl {
  let source = input.trim();
  if (source.startsWith('mesa:')) {
    let link: URL;
    try {
      link = new URL(source);
    } catch {
      throw new MesaError('usage', 'invalid Mesa project link');
    }
    if (
      link.protocol !== 'mesa:' ||
      link.hostname !== 'clone' ||
      link.pathname !== '' ||
      link.hash ||
      link.searchParams.size !== 1 ||
      !link.searchParams.get('url')
    ) {
      throw new MesaError('usage', 'expected mesa://clone?url=<repository-url>');
    }
    source = link.searchParams.get('url') ?? '';
  }
  let path: string;
  if (/^git@[A-Za-z0-9.-]+:[^\s]+$/.test(source)) {
    path = source.slice(source.indexOf(':') + 1);
  } else {
    let parsed: URL;
    try {
      parsed = new URL(source);
    } catch {
      throw new MesaError('usage', 'expected an HTTPS or SSH repository URL');
    }
    if (
      !['https:', 'ssh:'].includes(parsed.protocol) ||
      !parsed.hostname ||
      parsed.password ||
      parsed.search ||
      parsed.hash ||
      (parsed.username && !(parsed.protocol === 'ssh:' && parsed.username === 'git'))
    ) {
      throw new MesaError(
        'usage',
        'repository URL must be HTTPS or SSH without credentials or query',
      );
    }
    try {
      path = decodeURIComponent(parsed.pathname);
    } catch {
      throw new MesaError('usage', 'repository URL has an invalid path');
    }
  }
  const repo =
    path
      .split('/')
      .filter(Boolean)
      .at(-1)
      ?.replace(/\.git$/, '') ?? '';
  const slug = slugify(repo);
  if (!slug) throw new MesaError('usage', 'repository URL needs a project name');
  return { url: source, slug };
}
