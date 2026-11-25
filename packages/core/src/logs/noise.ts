// "Your services only" (CONTEXT.md, Cloud Logs): what a Cloud Logs read leaves out unless asked
// for everything, in one place. Measured on a real project, about 70% of entries were load
// balancer and proxy request lines, and GKE's own system containers log errors of their own.

/** Resource types whose entries are infrastructure: load balancers, proxies, clusters, nodes. */
const NOISY_RESOURCES = [
  'http_load_balancer',
  'l7_lb_rule',
  'internal_http_lb_rule',
  'tcp_ssl_proxy_rule',
  'k8s_cluster',
  'gke_cluster',
  'k8s_node',
];
/** Logs of requests a proxy in front of a service wrote, not the service. */
const NOISY_LOGS = [
  'run.googleapis.com/requests',
  'appengine.googleapis.com/request_log',
  'events',
];
/** GKE's own namespaces. */
const SYSTEM_NAMESPACES = [
  'kube-system',
  'kube-node-lease',
  'kube-public',
  'gke-managed-system',
  'gke-managed-cim',
  'gke-gmp-system',
  'gmp-system',
  'gmp-public',
  'istio-system',
  'config-management-system',
];
/** Sidecars and agents GKE runs beside a service. */
const SYSTEM_CONTAINERS = [
  'cilium',
  'cilium-agent',
  'node-cache',
  'konnectivity-agent',
  'metrics-server',
  'fluentbit',
  'fluentbit-gke',
  'gke-metrics-agent',
  'kube-proxy',
  'event-exporter',
  'prometheus-to-sd',
  'istio-proxy',
  'envoy',
  'esp',
];

const anyOf = (values: readonly string[]) => `(${values.map((v) => `"${v}"`).join(' OR ')})`;

/** The Logging filter clause that keeps only a person's own services' entries. */
export const OWN_SERVICES_FILTER = [
  `NOT resource.type=${anyOf(NOISY_RESOURCES)}`,
  ...NOISY_LOGS.map((log) => `NOT log_id("${log}")`),
  'NOT logName:"cloudaudit.googleapis.com"',
  `NOT resource.labels.namespace_name=${anyOf(SYSTEM_NAMESPACES)}`,
  // Every other gke-* namespace GKE adds.
  'NOT resource.labels.namespace_name=~"^gke-"',
  `NOT resource.labels.container_name=${anyOf(SYSTEM_CONTAINERS)}`,
].join(' AND ');
