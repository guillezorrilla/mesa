import { z } from 'zod';
import { type Http, readJson } from '../lib/http.js';
import { type Account, distinctSites, type Site } from './connection.js';

const API = 'https://api.atlassian.com';

const meSchema = z.object({
  account_id: z.string(),
  name: z.string(),
  email: z.string().optional(),
});
const resourcesSchema = z.array(z.object({ id: z.string(), name: z.string(), url: z.string() }));

/** The signed-in Atlassian account. */
export async function atlassianAccount(get: Http): Promise<Account> {
  const { account_id, name, email } = await readJson(
    await get(`${API}/me`),
    meSchema,
    'Atlassian /me',
  );
  return { id: account_id, name, ...(email ? { email } : {}) };
}

/** The Atlassian sites (cloud ids) the token reaches. */
export async function atlassianSites(get: Http): Promise<Site[]> {
  const sites = await readJson(
    await get(`${API}/oauth/token/accessible-resources`),
    resourcesSchema,
    'Atlassian accessible-resources',
  );
  return distinctSites(sites.map(({ id, name, url }) => ({ id, name, url })));
}
