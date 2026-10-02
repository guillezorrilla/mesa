import { useEffect, useState } from 'react';
import { useSettings } from '../useSettings';

/** A slider that follows the drag and saves once, where it is released. */
export function Range(props: {
  id: string;
  path: string;
  value: number;
  min: number;
  max: number;
}) {
  const { acting, save } = useSettings();
  const [draft, setDraft] = useState(props.value);
  useEffect(() => setDraft(props.value), [props.value]);
  const release = () => {
    if (draft !== props.value) save(props.path, draft);
  };
  return (
    <span className="flex items-center gap-2 text-xs text-muted-foreground">
      {props.min}
      <input
        id={props.id}
        type="range"
        className="w-32 accent-state-working"
        min={props.min}
        max={props.max}
        value={draft}
        aria-valuetext={String(draft)}
        disabled={acting}
        onChange={(event) => setDraft(Number(event.currentTarget.value))}
        onPointerUp={release}
        onKeyUp={release}
      />
      {props.max}
      <span className="w-6 text-right text-foreground">{draft}</span>
    </span>
  );
}
