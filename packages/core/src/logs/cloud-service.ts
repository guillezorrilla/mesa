import { join } from 'node:path';
import { z } from 'zod';
import type { MesaContext } from '../context.js';
import type { GitTextRunner } from '../git/message.js';
import { MesaError } from '../lib/result.js';
import { parseWith } from '../lib/schema.js';
import { callerOf } from '../sessions/window/caller.js';
import { askCloudLogs, keepQuery, runQueries } from './ask.js';
import { keepTurn, readAsks } from './ask-history.js';
import { cloudErrors, errorSamples } from './errors.js';
import { type CloudQuery, cloudFilter, cloudFilters, cloudLogs, envOf } from './gcp.js';
import {
  ALL_ENVS,
  type CloudView,
  GCP_PROJECT,
  GcpLogsSchema,
  PROD_ASK,
  PROD_ENV,
  PROD_WORD,
} from './gcp-config.js';
import { envSuggestions } from './gcp-envs.js';
import { cloudProjects } from './gcp-projects.js';
import { cloudServices } from './gcp-services.js';
import { maskEntry, maskGroup, maskText } from './mask.js';
import { metricCounts, metricViews } from './metrics.js';
import { exportViews, importViews, mergeViews } from './views.js';

/**
 * The Logs tab's side of Mesa (CONTEXT.md, Cloud Logs; Ask (logs)): the profile's GCP projects'
 * entries, error groups and metric counts, its setup and saved views, and Ask.
 */
/** How many GCP projects the switcher's Recent keeps. */
const RECENT = 12;

export function cloudLogsService(
  ctx: MesaContext,
  deps: {
    /** The skill run's owner, which Ask runs `cloud-logs` through. */
    runText: GitTextRunner;
    /** The profile's config set, with its receipt and guards. */
    setConfig: (dotted: string, value: string) => unknown;
  },
) {
  /** The profile's `logs.gcp`; not_found, which the Logs tab shows as its setup, when unset. */
  const gcpConfig = () => {
    const config = ctx.open().config.logs.gcp;
    if (!config)
      throw new MesaError(
        'not_found',
        'Cloud Logs has no GCP project yet: run mesa logs setup --project <id>',
        { reason: 'not_configured' },
      );
    return config;
  };
  /** `projects`, each checked to be one Cloud Logs reads: an agent reads no other. */
  const configuredProjects = (projects: string[]) => {
    const { projects: known } = gcpConfig();
    for (const project of projects)
      if (!known.includes(project))
        throw new MesaError(
          'usage',
          `no GCP project ${project} in logs.gcp.projects: ${known.join(', ')}`,
        );
    return projects;
  };
  const cloudDeps = () => ({ run: ctx.run, now: ctx.clock });
  const errorDeps = () => ({ run: ctx.run, http: ctx.http, now: ctx.clock });
  /** The session whose window runs this mesa, when it is one: an agent, an Ask's run among them. */
  const caller = () => callerOf({ store: ctx.store, env: ctx.env, profileName: ctx.profile });
  /** What an agent reads is masked unless logs.mask is off (mask.ts). */
  const forAgent = () => caller().inMesaWindow && ctx.open().config.logs.mask;
  /** Where an Ask's run keeps the queries it ran, one JSON line each (ask.ts, runQueries). */
  const queriesFile = (session: string) => join(ctx.paths.runs, `${session}.queries.jsonl`);
  const keepQueries = (filters: Record<string, string>) => {
    const run = caller().session;
    if (run?.kind !== 'run') return;
    for (const [project, filter] of Object.entries(filters))
      keepQuery(queriesFile(run.id), { project, filter });
  };
  /** `views` merged into the saved views (mergeViews). */
  const saveViews = (views: CloudView[]) =>
    deps.setConfig('logs.views', JSON.stringify(mergeViews(ctx.open().config.logs.views, views)));
  return {
    /**
     * The newest Cloud Logs entries `query` picks across the GCP projects (cloudLogs). Read by an
     * agent (a Mesa window), they come masked unless logs.mask is off, and an Ask's run keeps its
     * queries for the conversation.
     */
    gcp: async (query: CloudQuery = {}) => {
      const config = gcpConfig();
      const env = envOf(config, query.env);
      const read = await cloudLogs(cloudDeps(), config, { ...query, env: env ?? ALL_ENVS });
      keepQueries(read.filters);
      return {
        projects: config.projects,
        env: env ?? null,
        envs: Object.keys(config.envs),
        ...read,
        entries: forAgent() ? read.entries.map(maskEntry) : read.entries,
      };
    },
    /** The services `env` logged in the last hour in every project, with their kind (cloudServices). */
    gcpServices: async (env?: string) => {
      const config = gcpConfig();
      const name = envOf(config, env);
      return { env: name ?? null, ...(await cloudServices(cloudDeps(), config, name)) };
    },
    /** gcloud's default project and every project the account sees, or with `search` those holding it. */
    gcpProjects: (search?: string) => cloudProjects(ctx.run, search),
    /** The envs the setup suggests for GCP `projects`: their GKE clusters and Cloud Run suffixes. */
    gcpEnvs: (projects: string[]) =>
      envSuggestions(ctx.run, parseWith(z.array(GCP_PROJECT), projects, '--project')),
    /** Points Cloud Logs at GCP `projects` with `envs`, keeping a service label set before. */
    gcpSetup: async (projects: string[], envs: Record<string, string> = {}) => {
      const service = ctx.open().config.logs.gcp?.service;
      const gcp = parseWith(
        GcpLogsSchema,
        { projects, envs, ...(service ? { service } : {}) },
        'logs.gcp',
      );
      await deps.setConfig('logs.gcp', JSON.stringify(gcp));
      // The switcher's Recent: these first, then the others read before.
      const { recentProjects } = ctx.open().config.logs;
      const recent = [...new Set([...projects, ...recentProjects])].slice(0, RECENT);
      await deps.setConfig('logs.recentProjects', JSON.stringify(recent));
      return { gcp };
    },
    /** Stars GCP `project` in the project switcher, or with `on` false takes its star off. */
    star: async (project: string, on = true) => {
      parseWith(GCP_PROJECT, project, 'project');
      const { starredProjects } = ctx.open().config.logs;
      const starred = on
        ? [...new Set([...starredProjects, project])]
        : starredProjects.filter((p) => p !== project);
      await deps.setConfig('logs.starredProjects', JSON.stringify(starred));
      return { starred };
    },
    /** The error groups across the GCP projects (cloudErrors), masked for an agent. */
    errors: async (query: CloudQuery = {}) => {
      const config = gcpConfig();
      const env = envOf(config, query.env);
      const found = await cloudErrors(errorDeps(), config, { ...query, env: env ?? ALL_ENVS });
      // An Ask's run keeps the errors read it made as the Logging filter it stands for.
      const errorsOnly = cloudFilter(
        config,
        { ...query, env: env ?? ALL_ENVS, severity: 'error' },
        ctx.clock(),
      );
      keepQueries(
        Object.fromEntries((query.projects ?? config.projects).map((p) => [p, errorsOnly])),
      );
      return {
        ...found,
        groups: forAgent() ? found.groups.map(maskGroup) : found.groups,
      };
    },
    /** A few recent events of Error Reporting group `id` in GCP `project` (errorSamples). */
    errorSamples: async (project: string, id: string, since?: string) => {
      configuredProjects([project]);
      const events = await errorSamples(errorDeps(), project, id, since);
      return {
        events: forAgent() ? events.map((e) => ({ ...e, message: maskText(e.message) })) : events,
      };
    },
    /** Log-based metric `metric`'s count per 5 minutes in GCP `project` (metricCounts). */
    counts: (projects: string[], metric: string, since = '1h') =>
      metricCounts(errorDeps(), configuredProjects(projects), metric, since),
    /** Saved views: the log-based metrics of a project imported, and views shared as YAML. */
    views: {
      importMetrics: async (project: string) => {
        const views = await metricViews(ctx.run, project);
        await saveViews(views);
        return { views };
      },
      export: (file: string) => {
        const { views } = ctx.open().config.logs;
        exportViews(ctx.absolute(file), views);
        return { file: ctx.absolute(file), views: views.length };
      },
      import: async (file: string) => {
        const views = importViews(ctx.absolute(file));
        await saveViews(views);
        return { views };
      },
    },
    /**
     * `question` about the entries `query` picks, answered by a General `cloud-logs` run that
     * cites them (askCloudLogs) and may run read-only queries of its own; a turn of conversation
     * `conversation` when given, else of a new one, kept with the queries it ran. The first Ask
     * on `prod` of each GCP project is needs_approval until `allowProd`, which the config keeps.
     */
    ask: async (
      question: string,
      query: CloudQuery & { allowProd?: boolean; conversation?: string } = {},
    ) => {
      const config = gcpConfig();
      const env = envOf(config, query.env);
      const { prodAsk, mask } = ctx.open().config.logs;
      // Prod is what the Ask reads: the env named prod, or filters that name prod, in the projects
      // its services and projects pick; only those projects are confirmed.
      const filters = cloudFilters(config, { ...query, env: env ?? ALL_ENVS }, ctx.clock());
      const prod = env === PROD_ENV || Object.values(filters).some((f) => PROD_WORD.test(f));
      const unasked = Object.keys(filters).filter((project) => !prodAsk.includes(project));
      if (prod && unasked.length) {
        if (!query.allowProd)
          throw new MesaError(
            'needs_approval',
            `${PROD_ASK}: confirm once for ${unasked.join(', ')} with --allow-prod`,
            { reason: 'prod_ask', projects: unasked },
          );
        // The config's guard refuses it from a Mesa window: a person confirms (profile/service.ts).
        await deps.setConfig('logs.prodAsk', JSON.stringify([...prodAsk, ...unasked]));
      }
      const { allowProd: _, conversation, limit: __, ...kept } = query;
      const earlier = readAsks(ctx.paths.cloudAsks).find((a) => a.id === conversation)?.turns ?? [];
      // Read afresh rather than trust entries a caller sends: the model sees only what gcloud gave.
      const read = await cloudLogs(cloudDeps(), config, { ...query, env: env ?? ALL_ENVS });
      const filter = Object.entries(read.filters)
        .map(([project, each]) => `${project}: ${each}`)
        .join('\n');
      const entries = mask ? read.entries.map(maskEntry) : read.entries;
      const asked = await askCloudLogs(deps.runText, question, { filter, entries }, earlier);
      const queries = [
        ...Object.entries(read.filters).map(([project, each]) => ({ project, filter: each })),
        ...runQueries(queriesFile(asked.run.session)),
      ];
      const turn = {
        at: ctx.clock().toISOString(),
        question,
        query: { ...kept, ...(env ? { env } : {}) },
        answer: asked.answer,
        cited: asked.cited,
        queries,
        session: asked.run.session,
      };
      const ask = keepTurn(ctx.paths.cloudAsks, conversation ?? asked.run.session, turn, ctx);
      return {
        conversation: ask.id,
        projects: config.projects,
        env: env ?? null,
        ...read,
        ...asked,
        queries,
      };
    },
    /** The kept Ask conversations, newest first. */
    asks: () => ({ asks: readAsks(ctx.paths.cloudAsks) }),
  };
}
