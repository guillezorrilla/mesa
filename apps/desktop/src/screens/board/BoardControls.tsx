import type { BoardPreferences } from '@mesa/core';
import { BOARD_DENSITIES, BOARD_GROUPS, BOARD_SORTS, BOARD_VIEWS } from '@mesa/core/browser';
import { Label } from '@/components/ui/label';

const OPTIONS = {
  view: BOARD_VIEWS,
  group: BOARD_GROUPS,
  density: BOARD_DENSITIES,
  sort: BOARD_SORTS,
};

export function BoardControls(props: {
  preferences: BoardPreferences;
  disabled: boolean;
  onChange: (key: 'view' | 'group' | 'density' | 'sort', value: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2" data-testid="board-controls">
      {(Object.keys(OPTIONS) as (keyof typeof OPTIONS)[]).map((key) => (
        <Label
          key={key}
          className="flex items-center gap-1 text-muted-foreground text-xs capitalize"
        >
          {key}
          <select
            data-testid={key === 'group' ? 'board-group-select' : `board-${key}`}
            aria-label={`Board ${key}`}
            className="h-8 rounded-md border border-input bg-background px-2 text-foreground"
            value={props.preferences[key]}
            disabled={props.disabled || (key === 'group' && props.preferences.view === 'workflow')}
            onChange={(event) => props.onChange(key, event.target.value)}
          >
            {OPTIONS[key].map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </Label>
      ))}
    </div>
  );
}
