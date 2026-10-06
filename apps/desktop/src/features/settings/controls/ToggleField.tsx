import { Switch } from '@/components/ui/switch';
import { useSettings } from '../useSettings';

/** A switch saved to `path` as soon as it flips. */
export function ToggleField(props: { id: string; path: string; checked: boolean }) {
  const { acting, save } = useSettings();
  return (
    <Switch
      id={props.id}
      checked={props.checked}
      disabled={acting}
      onCheckedChange={(checked) => save(props.path, checked)}
    />
  );
}
