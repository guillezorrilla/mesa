import {
  automaticSites,
  DECISION_SITES,
  type DecisionSite,
  measuredText,
  PASSED_GATE,
  provenSites,
  type SystemOneProvider,
  siteMeasure,
} from '@mesa/core/browser';
import { SITE_LABELS } from './models';

/**
 * How `model` runs `site` (ADR-0019): automatic only once it passed both the quality gate and the
 * paired workflows, or as experimental when the person opted in; else on demand, or off for the
 * Board's supervision, which has no on-demand call.
 */
function modeOf(model: SystemOneProvider, site: DecisionSite, experimental: boolean) {
  if (provenSites(model).includes(site)) return 'automatic';
  if (automaticSites(model, experimental).includes(site)) return 'automatic (experimental)';
  if (site === 'supervision') return 'off';
  return PASSED_GATE[model].includes(site) ? 'on demand' : 'on demand (experimental)';
}

/** Each decision site of a model card: how it runs, and what it measured against the gates. */
export function SiteResultsList(props: { model: SystemOneProvider; experimental: boolean }) {
  return (
    <ul data-testid={`${props.model}-sites`} className="grid gap-1">
      {DECISION_SITES.map((site) => (
        <li key={site}>
          {SITE_LABELS[site]}: {modeOf(props.model, site, props.experimental)}
          {/* A span: the row's description is already a paragraph. */}
          <span className="block">{measuredText(siteMeasure(props.model, site))}</span>
        </li>
      ))}
    </ul>
  );
}
