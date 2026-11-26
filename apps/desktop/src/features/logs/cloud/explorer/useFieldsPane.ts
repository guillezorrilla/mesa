import { useKept } from '@/lib/keptValue';
import { useKeptWidth, type WidthBounds } from '@/lib/useKeptWidth';
import { toggledColumn } from './cloudColumns';

/** The fields pane's width bounds, in pixels. */
const FIELDS_WIDTH: WidthBounds = { min: 180, max: 420, initial: 232, step: 16 };

/**
 * The Explorer's fields pane as the person left it, kept on this machine: its width, whether it is
 * hidden, and the context fields pinned as columns beside each row (cloudColumns).
 */
export function useFieldsPane() {
  const [width, setWidth] = useKeptWidth('mesa.logs.fields.width', FIELDS_WIDTH);
  const [hidden, keepHidden] = useKept('mesa.logs.fields.hidden');
  const [kept, keepColumns] = useKept('mesa.logs.fields.columns');
  const columns = kept ? kept.split('\n').filter(Boolean) : [];
  return {
    width,
    setWidth,
    bounds: FIELDS_WIDTH,
    hidden: hidden === '1',
    setHidden: (next: boolean) => keepHidden(next ? '1' : undefined),
    columns,
    pin: (key: string) => keepColumns(toggledColumn(columns, key).join('\n') || undefined),
  };
}
