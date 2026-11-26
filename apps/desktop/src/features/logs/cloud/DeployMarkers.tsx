import type { CloudDeploy } from '@mesa/core';
import { deployName } from '@mesa/core/browser';
import { dayTime, serviceColor } from '../shared/logLines';

/**
 * Deploys over a chart spanning `from` to `to` (ms): each a thin vertical line in its service's
 * colour, capped with a dot, its service, revision and time in a tooltip. The parent is
 * `relative`; a deploy outside the span draws nothing.
 */
export function DeployMarkers(props: {
  deploys: readonly CloudDeploy[];
  from: number;
  to: number;
}) {
  const span = props.to - props.from;
  if (span <= 0) return null;
  return props.deploys.map((deploy) => {
    const x = (Date.parse(deploy.at) - props.from) / span;
    if (!(x >= 0 && x <= 1)) return null;
    const color = serviceColor(`${deploy.project}/${deploy.service}`);
    const name = `Deploy ${deployName(deploy)}, ${dayTime(deploy.at)}`;
    return (
      <span
        key={`${deploy.project}/${deploy.service}/${deploy.revision}`}
        role="img"
        aria-label={name}
        title={`${name} (${deploy.revision})`}
        data-deploy={deploy.revision}
        // A hover target wider than the line, centred on it.
        className="absolute inset-y-0 z-10 flex w-2 -translate-x-1/2 cursor-default justify-center"
        style={{ left: `${x * 100}%` }}
      >
        <span className="w-px opacity-80" style={{ backgroundColor: color }} />
        <span
          aria-hidden
          className="absolute -top-0.5 size-1.5 rounded-full ring-2 ring-card"
          style={{ backgroundColor: color }}
        />
      </span>
    );
  });
}
