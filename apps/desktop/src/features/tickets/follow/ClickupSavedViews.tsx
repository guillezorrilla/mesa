import type { ClickupSavedView } from '@mesa/core';
import { useEffect } from 'react';
import { Muted } from '@/components/Muted';
import { useCommand } from '@/lib/useCommand';

/**
 * ClickUp's Follow dialog Saved view step: the Workspace's saved task views, each with its type
 * and where it is kept, the first picked at first.
 */
export function ClickupSavedViews(props: {
  picked: ClickupSavedView | undefined;
  onPick: (view: ClickupSavedView) => void;
}) {
  const { picked, onPick } = props;
  const views = useCommand('tickets.savedViews').data?.views;
  const first = views?.[0];
  useEffect(() => {
    if (!picked && first) onPick(first);
  }, [picked, first, onPick]);
  if (!views) return <Muted role="status">Reading saved views...</Muted>;
  return (
    <div
      role="radiogroup"
      aria-label="Saved views"
      className="max-h-44 divide-y overflow-auto rounded-lg border"
    >
      {views.map((view) => (
        <label
          key={view.id}
          htmlFor={`clickup-view-${view.id}`}
          className="flex cursor-pointer items-center gap-2.5 px-3 py-2 text-sm hover:bg-accent/60"
        >
          <input
            id={`clickup-view-${view.id}`}
            type="radio"
            name="clickup-view"
            checked={picked?.id === view.id}
            onChange={() => onPick(view)}
            className="accent-primary"
          />
          <span className="rounded border px-1.5 text-[11px] font-medium text-muted-foreground capitalize">
            {view.type.replaceAll('_', ' ')}
          </span>
          {view.name}
          <span className="ml-auto text-xs text-muted-foreground">in {view.where}</span>
        </label>
      ))}
      {!views.length && (
        <p className="px-3 py-2 text-sm text-muted-foreground">No saved views yet.</p>
      )}
    </div>
  );
}
