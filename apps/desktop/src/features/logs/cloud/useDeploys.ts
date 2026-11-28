import type { CloudDeploy } from '@mesa/core';
import type { CloudFilters } from '@/lib/client/logs';
import { useOptional } from '@/lib/useCommand';

const NONE: CloudDeploy[] = [];

/**
 * The deploys of the services `filters` shows over its range (`mesa logs deploys`): read by its env,
 * projects, services and range only, so a query or severity change reads none afresh; none while
 * reading or when they cannot be read.
 */
export function useDeploys(filters: CloudFilters): readonly CloudDeploy[] {
  const { env, services, projects, since } = filters;
  return useOptional('logs.deploys', { env, services, projects, since }).data?.deploys ?? NONE;
}
