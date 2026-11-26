import { clampWidth, type WidthBounds } from '@/lib/useKeptWidth';
import { useLogsKept } from '../useLogsKept';
import { toggledColumn } from './pinnedColumns';

/** The fields pane's width bounds, in pixels. */
const FIELDS_WIDTH: WidthBounds = { min: 180, max: 420, initial: 232, step: 16 };

/**
 * The Explorer's fields pane as the person left it, kept per profile (useLogsKept): its width,
 * whether it is hidden, which field sections are open, and the fields pinned as columns beside each
 * row (pinnedColumns).
 */
export function useFieldsPane() {
  const [kept, keepWidth] = useLogsKept('fields.width', FIELDS_WIDTH.initial);
  const [hidden, setHidden] = useLogsKept('fields.hidden', false);
  const [columns, keepColumns] = useLogsKept<string[]>('fields.columns', []);
  const [sections, keepSections] = useLogsKept<Record<string, boolean>>('fields.sections', {});
  return {
    width: clampWidth(FIELDS_WIDTH, kept),
    setWidth: (next: number) => keepWidth(clampWidth(FIELDS_WIDTH, next)),
    bounds: FIELDS_WIDTH,
    hidden,
    setHidden,
    columns,
    pin: (key: string) => keepColumns(toggledColumn(columns, key)),
    /** Whether field `name`'s section is open: as the person left it, else `initial`. */
    isOpen: (name: string, initial: boolean) => sections[name] ?? initial,
    setOpen: (name: string, open: boolean) => keepSections({ ...sections, [name]: open }),
  };
}
