import {
  DECISION_SITES,
  type DecisionSite,
  measuredText,
  type SiteMode,
  type SystemOneProvider,
  siteMeasure,
  siteMode,
} from '@mesa/core/browser';
import { SITE_LABELS } from './models';

const MODE: Record<SiteMode, string> = {
  automatic: 'automatic',
  'on-demand': 'on demand',
  off: 'off',
};

/** How `model` runs `site` (ADR-0019, siteMode), in words. */
function modeOf(model: SystemOneProvider, site: DecisionSite, experimental: boolean) {
  const runs = siteMode(model, site, experimental);
  return `${MODE[runs.mode]}${runs.experimental ? ' (experimental)' : ''}`;
}

/** Each decision site of a model: how it runs, and what it measured against the gates. */
export function SiteResultsList(props: { model: SystemOneProvider; experimental: boolean }) {
  return (
    <ul data-testid={`${props.model}-sites`} className="grid gap-1.5">
      {DECISION_SITES.map((site) => (
        <li key={site}>
          <span className="text-foreground">
            {SITE_LABELS[site]}: {modeOf(props.model, site, props.experimental)}
          </span>
          <span className="block">{measuredText(siteMeasure(props.model, site))}</span>
        </li>
      ))}
    </ul>
  );
}
