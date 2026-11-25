import { join } from 'node:path';
import { z } from 'zod';
import type { MesaContext } from '../context.js';
import type { GitTextRunner } from '../git/message.js';
import { MesaError } from '../lib/result.js';
import { parseWith } from '../lib/schema.js';
import { GENERAL_PROJECT } from '../sessions/record/general.js';
import { callerOf } from '../sessions/window/caller.js';
import { askCloudLogs, keepQuery, queryFromWords, runQueries } from './ask.js';
import { keepTurn, readAsks } from './ask-history.js';
import { type CloudErrorGroup, cloudErrors, errorSamples } from './errors.js';
import { askSessionGoal, errorFixGoal } from './fix-goal.js';
import { type CloudQuery, cloudFilter, cloudFilters, cloudLogs, envOf } from './gcp.js';
import {
  ALL_ENVS,
  type CloudView,
  GCP_PROJECT,
  type GcpLogs,
  GcpLogsSchema,
  PROD_ASK,
  PROD_ENV,
  PROD_WORD,
} from './gcp-config.js';
import { envSuggestions } from './gcp-envs.js';
import { cloudProjects } from './gcp-projects.js';
import { cloudServices } from './gcp-services.js';
import { maskEntry, maskErrors, maskText } from './mask.js';
import { metricCounts, metricViews } from './metrics.js';
import { exportViews, importViews, mergeViews } from './views.js';

/**
 * The Logs tab's side of Mesa (CONTEXT.md, Cloud Logs; Ask (logs)): the profile's GCP projects'
 * entries, error groups and metric counts, its setup and saved views, and Ask.
 */
/** An error group as Fix in session takes it: what its goal reads. */
const FixGroupSchema = z.object({
  project: GCP_PROJECT,
  id: z.string(),
  message: z.string(),
  sample: z.string(),
  count: z.number(),
  firstSeen: z.string(),
  lastSeen: z.string(),
  services: z.array(z.string()),
  badge: z.enum(['new', 'back']).nullable(),
  source: z.enum(['error-reporting', 'logs']),
});

/** How many GCP projects the switcher's Recent keeps. */
const RECENT = 12;

export function cloudLogsService(
  ctx: MesaContext,
  deps: {
    /** The skill run's owner, which Ask runs `cloud-logs` through. */
    runText: GitTextRunner;
    /** The profile's config set, with its receipt and guards. */
    setConfig: (dotted: string, value: string) => unknown;
    /** Opens a session in registered `project` (or General) with `goal`, past the guardrail (`yes` answers its ask). */
    openSession: (project: string, goal: string, yes: boolean) => Promise<unknown>;
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
  /**
   * The first read of prod from each GCP project is needs_approval until a person confirms it
   * (`allowProd`, kept in logs.prodAsk; the config's guard refuses that from a Mesa window).
   * Prod is the env named prod, or a filter (or a metric) that names prod, in the projects read.
   */
  const prodGate = async (filters: Record<string, string>, prodEnv: boolean, allowProd = false) => {
    const { prodAsk } = ctx.open().config.logs;
    const prod = prodEnv || Object.values(filters).some((f) => PROD_WORD.test(f));
    const unasked = Object.keys(filters).filter((project) => !prodAsk.includes(project));
    if (!prod || !unasked.length) return;
    if (!allowProd)
      throw new MesaError(
        'needs_approval',
        `${PROD_ASK}: confirm once for ${unasked.join(', ')} with --allow-prod`,
        {
          reason: 'prod_ask',
          projects: unasked,
        },
      );
    await deps.setConfig('logs.prodAsk', JSON.stringify([...prodAsk, ...unasked]));
  };
  /** An agent's read of prod passes prodGate first, as Ask's does; a person's read needs none. */
  const agentProdGate = async (config: GcpLogs, query: CloudQuery, env: string | undefined) => {
    if (!caller().inMesaWindow) return;
    await prodGate(
      cloudFilters(config, { ...query, env: env ?? ALL_ENVS }, ctx.clock()),
      env === PROD_ENV,
    );
  };
  /** What a query asked for itself, which an Ask's Run applies: no env, noise or time bounds. */
  const ownOf = (query: CloudQuery) =>
    Object.fromEntries(
      Object.entries({
        filter: query.filter,
        severity: query.severity,
        text: query.text,
        fields: query.fields,
        services: query.services,
        trace: query.trace,
      }).filter(([, v]) => v !== undefined),
    );
  /** Where an Ask's run keeps the queries it ran, one JSON line each (ask.ts, runQueries). */
  const queriesFile = (session: string) => join(ctx.paths.runs, `${session}.queries.jsonl`);
  const keepQueries = (filters: Record<string, string>, query: CloudQuery) => {
    const run = caller().session;
    if (run?.kind !== 'run') return;
    for (const [project, filter] of Object.entries(filters))
      keepQuery(queriesFile(run.id), { project, filter, own: ownOf(query) });
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
      await agentProdGate(config, query, env);
      const read = await cloudLogs(cloudDeps(), config, { ...query, env: env ?? ALL_ENVS });
      keepQueries(read.filters, query);
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
      await agentProdGate(config, query, env);
      const found = await cloudErrors(errorDeps(), config, { ...query, env: env ?? ALL_ENVS });
      // An Ask's run keeps the errors read it made as the Logging filter it stands for.
      const errorsOnly = cloudFilter(
        config,
        { ...query, env: env ?? ALL_ENVS, severity: 'error' },
        ctx.clock(),
      );
      keepQueries(
        Object.fromEntries((query.projects ?? config.projects).map((p) => [p, errorsOnly])),
        { ...query, severity: 'error' },
      );
      return forAgent() ? maskErrors(found) : found;
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
    counts: async (projects: string[], metric: string, since = '1h') => {
      configuredProjects(projects);
      // An agent's count of a prod metric passes the same gate as its reads.
      if (caller().inMesaWindow)
        await prodGate(Object.fromEntries(projects.map((p) => [p, `${p} ${metric}`])), false);
      return metricCounts(errorDeps(), projects, metric, since);
    },
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
      const { mask } = ctx.open().config.logs;
      // Prod is what the Ask reads: the env named prod, or filters that name prod, in the projects
      // its services and projects pick; only those projects are confirmed.
      await prodGate(
        cloudFilters(config, { ...query, env: env ?? ALL_ENVS }, ctx.clock()),
        env === PROD_ENV,
        query.allowProd,
      );
      const { allowProd: _, conversation, limit: __, ...kept } = query;
      const earlier = readAsks(ctx.paths.cloudAsks).find((a) => a.id === conversation)?.turns ?? [];
      // Read afresh rather than trust entries a caller sends: the model sees only what gcloud gave.
      const read = await cloudLogs(cloudDeps(), config, { ...query, env: env ?? ALL_ENVS });
      // What the person typed in a filter (an email in --text) is masked like the entries.
      const filter = Object.entries(read.filters)
        .map(([project, each]) => `${project}: ${mask ? maskText(each) : each}`)
        .join('\n');
      const entries = mask ? read.entries.map(maskEntry) : read.entries;
      const asked = await askCloudLogs(deps.runText, question, { filter, entries }, earlier);
      const queries = [
        ...Object.entries(read.filters).map(([project, each]) => ({
          project,
          filter: each,
          own: ownOf(kept),
        })),
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
        entries: forAgent() ? read.entries.map(maskEntry) : read.entries,
        ...asked,
        queries,
      };
    },
    /**
     * A Logging query for `sentence` (queryFromWords), from the query shown and the context fields
     * of the entries `query` picks (their names only).
     */
    query: async (sentence: string, query: CloudQuery = {}) => {
      const config = gcpConfig();
      const env = envOf(config, query.env);
      const read = await cloudLogs(cloudDeps(), config, {
        ...query,
        env: env ?? ALL_ENVS,
        limit: 200,
      });
      const fields = [...new Set(read.entries.flatMap((e) => Object.keys(e.fields)))];
      return queryFromWords(deps.runText, sentence, { query: query.filter ?? '', fields });
    },
    /**
     * A session in registered `target` (or General) that fixes error `group`, or carries Ask
     * `conversation` on: its goal fences the log text as data and is masked unless logs.mask is
     * off (fix-goal.ts); a group read from prod passes the prod gate; the goal passes the guardrail
     * (`yes` answers its ask).
     */
    session: async (
      target: string,
      input: { group?: unknown; conversation?: string },
      opts: { env?: string; allowProd?: boolean; yes?: boolean } = {},
    ) => {
      const config = gcpConfig();
      const mask = ctx.open().config.logs.mask ? maskText : undefined;
      let goal: string;
      if (input.conversation) {
        const ask = readAsks(ctx.paths.cloudAsks).find((a) => a.id === input.conversation);
        if (!ask) throw new MesaError('not_found', `no Ask conversation ${input.conversation}`);
        goal = askSessionGoal(ask.turns, mask);
      } else {
        const group = parseWith(FixGroupSchema, input.group, 'group') as CloudErrorGroup;
        configuredProjects([group.project]);
        const env = envOf(config, opts.env);
        await prodGate(
          cloudFilters(config, { env: env ?? ALL_ENVS, projects: [group.project] }, ctx.clock()),
          env === PROD_ENV,
          opts.allowProd,
        );
        goal = errorFixGoal(group, mask);
      }
      const project = target === 'general' ? GENERAL_PROJECT : target;
      return { session: await deps.openSession(project, goal, Boolean(opts.yes)) };
    },
    /** The kept Ask conversations, newest first. */
    asks: () => ({ asks: readAsks(ctx.paths.cloudAsks) }),
  };
}
