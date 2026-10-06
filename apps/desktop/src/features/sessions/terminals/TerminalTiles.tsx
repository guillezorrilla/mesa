import type { Config, NativeResponse, ProjectRow, TreeRow } from '@mesa/core';
import { DEFAULT_TERMINAL_PREFERENCES } from '@mesa/core/browser';
import { reviewable } from '../rows';
import { TerminalPanel } from './TerminalPanel';
import type { TerminalPanels } from './useTerminalPanels';

/**
 * The open terminal panels: only the selected session's shows when one is selected, and in the
 * Grid the tiles of `gridProject` (or the zoomed one).
 */
export function TerminalTiles({
  rows,
  panels,
  selectedSession,
  gridMode,
  gridProject,
  terminalPreferences,
  projects,
  acting,
  onFileLink,
  onWebLink,
  onOpenTerminal,
  onReviewResponse,
}: {
  rows?: TreeRow[];
  panels: TerminalPanels;
  selectedSession?: string;
  gridMode?: boolean;
  gridProject: string;
  terminalPreferences?: Config['terminal'];
  projects?: readonly ProjectRow[];
  acting: boolean;
  onFileLink?: (session: string, target: string) => void;
  onWebLink: (session: string, url: string) => void;
  onOpenTerminal: (id: string) => void;
  onReviewResponse: (id: string, response: NativeResponse) => void;
}) {
  const { liveRows, zoomed } = panels;
  const messageActions =
    terminalPreferences?.messageActions ?? DEFAULT_TERMINAL_PREFERENCES.messageActions;
  // A session's terminal takes its project's theme, which is the profile's unless mesa.yaml overrides it.
  const preferences = (id: string) => {
    const project = rows?.find((row) => row.id === id)?.project;
    const theme = projects?.find((row) => row.name === project)?.terminalTheme;
    return terminalPreferences && theme ? { ...terminalPreferences, theme } : terminalPreferences;
  };
  /** A panel's window, so a swap, which moves its session to a new one, remounts it. */
  const panelWindow = (id: string) => {
    const row = rows?.find((r) => r.id === id);
    return row?.managed ? row.tmux.window : '';
  };
  return panels.panels.map((id) => (
    <div
      // A swap moves the session to a new window: its terminal attaches there afresh.
      key={`${id}-${panelWindow(id)}`}
      data-testid={gridMode ? 'grid-tile' : undefined}
      hidden={
        selectedSession
          ? id !== selectedSession
          : gridMode
            ? (gridProject !== 'all' &&
                !liveRows.some((row) => row.id === id && row.project === gridProject)) ||
              (Boolean(zoomed) && zoomed !== id)
            : true
      }
      className={
        selectedSession
          ? 'h-full min-w-0 flex-1'
          : gridMode
            ? zoomed === id
              ? 'col-span-full h-[70vh] min-w-[320px]'
              : 'h-[380px] min-w-[320px] resize overflow-auto'
            : undefined
      }
    >
      <TerminalPanel
        sessionId={id}
        preferences={preferences(id)}
        onFileLink={onFileLink}
        onWebLink={onWebLink}
        busy={acting}
        onOpenExternal={() => onOpenTerminal(id)}
        onClose={() => panels.close(id)}
        grid={gridMode}
        selected={Boolean(selectedSession)}
        focus={id === selectedSession}
        zoomed={zoomed === id}
        onZoom={() => panels.toggleZoom(id)}
        onReviewResponse={
          messageActions && rows?.some((row) => row.id === id && reviewable(row))
            ? (response) => onReviewResponse(id, response)
            : undefined
        }
      />
    </div>
  ));
}
