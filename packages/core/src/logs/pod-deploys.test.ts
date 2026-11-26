import { expect, test } from 'vitest';
import { type PodTemplate, podDeploys, podTemplateOf } from './pod-deploys.js';

const at = (m: number) => `2026-05-06T07:${String(m).padStart(2, '0')}:00Z`;
const pod = (
  m: number,
  revision: string,
  workload = 'harbour-beta/tides/tide-api',
): PodTemplate => ({
  project: 'tide-tables-123',
  service: 'tide-api',
  workload,
  revision,
  time: at(m),
});

test("a GKE entry's pod template is its hash, in the workload its cluster, namespace and controller name", () => {
  const raw = {
    timestamp: at(3),
    resource: {
      type: 'k8s_container',
      labels: { cluster_name: 'harbour-beta', namespace_name: 'tides', container_name: 'tide-api' },
    },
    labels: {
      'k8s-pod/pod-template-hash': '7c9d5f8b6',
      'logging.gke.io/top_level_controller_name': 'tide-api',
    },
  };
  expect(podTemplateOf(raw, 'tide-tables-123', 'tide-api')).toEqual(pod(3, '7c9d5f8b6'));
  expect(
    podTemplateOf(
      { ...raw, resource: { type: 'cloud_run_revision' } },
      'tide-tables-123',
      'tide-api',
    ),
  ).toBeUndefined();
  expect(podTemplateOf({ ...raw, labels: {} }, 'tide-tables-123', 'tide-api')).toBeUndefined();
});

test('a new hash is a deploy once its workload has logged five minutes under others; side by side workloads and a page starting mid-rollout give none', () => {
  expect(
    podDeploys([
      pod(40, 'c3c3c3'),
      pod(5, 'a1a1a1'),
      pod(30, 'a1a1a1'),
      pod(31, 'c3c3c3'),
      // The same container in another namespace runs its own hash all along: no deploy.
      pod(6, 'b2b2b2', 'harbour-beta/tides-canary/tide-api'),
      pod(35, 'b2b2b2', 'harbour-beta/tides-canary/tide-api'),
      // Two hashes within the first minutes of what was read: a rollout already under way.
      pod(50, 'd4d4d4', 'harbour-beta/tides/tide-worker'),
      pod(52, 'e5e5e5', 'harbour-beta/tides/tide-worker'),
    ]),
  ).toEqual([
    {
      project: 'tide-tables-123',
      service: 'tide-api',
      revision: 'c3c3c3',
      at: at(31),
      source: 'logs',
    },
  ]);
});
