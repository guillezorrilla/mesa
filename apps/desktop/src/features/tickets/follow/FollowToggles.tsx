import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';

/** A Follow dialog's two narrowings, in its tracker's words: only the person's, and done hidden. */
export function FollowToggles(props: {
  labels: { mine: string; hideDone: string };
  mine: boolean;
  hideDone: boolean;
  onMine: (on: boolean) => void;
  onHideDone: (on: boolean) => void;
}) {
  const rows = [
    ['view-mine', props.labels.mine, props.mine, props.onMine],
    ['view-hide-done', props.labels.hideDone, props.hideDone, props.onHideDone],
  ] as const;
  return rows.map(([id, label, value, onChange]) => (
    <div key={id} className="flex items-center justify-between">
      <Label htmlFor={id} className="font-normal">
        {label}
      </Label>
      <Switch id={id} checked={value} onCheckedChange={onChange} />
    </div>
  ));
}
