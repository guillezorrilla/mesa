import type { Shortcuts } from '@mesa/core';
import { DEFAULT_SHORTCUTS, shortcutFromKeys } from '@mesa/core/browser';
import { Keyboard, Pencil, X } from 'lucide-react';
import { useState } from 'react';
import { IconButton } from '@/components/IconButton';
import { said } from '@/components/Toast';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { FIXED_SHORTCUTS, keyCaps } from '@/lib/fixedShortcuts';
import { useAct } from '@/lib/useAct';
import { useRun } from '@/lib/useCommand';

/** The profile's shortcuts, each customizable; the order the reference app lists its global ones in. */
const CUSTOM: { key: keyof Shortcuts; label: string }[] = [
  { key: 'search', label: 'Command palette' },
  { key: 'newSession', label: 'New session' },
  { key: 'board', label: 'Go to Sessions' },
];
const PROJECT = [
  ['Go to file', FIXED_SHORTCUTS.goToFile],
  ['Find in files', FIXED_SHORTCUTS.findInFiles],
] as const;
/** Every fixed shortcut by its name, so a customized one cannot take it. */
const FIXED: (readonly [string, string])[] = [
  ['Keyboard shortcuts', FIXED_SHORTCUTS.keyboardShortcuts],
  ...PROJECT,
];

/** Every Mesa shortcut as key caps; hover a customizable one and press its pencil to record keys. */
export function KeyboardShortcutsDialog(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  shortcuts?: Shortcuts;
  onChanged: () => void;
}) {
  const shortcuts = props.shortcuts ?? DEFAULT_SHORTCUTS;
  // Which shortcut is recording: while one is, Escape cancels it instead of closing the dialog.
  const [recording, setRecording] = useState<keyof Shortcuts>();
  return (
    <Dialog
      open={props.open}
      onOpenChange={(open) => {
        setRecording(undefined);
        props.onOpenChange(open);
      }}
    >
      <DialogContent
        data-testid="shortcut-settings"
        showCloseButton={false}
        onEscapeKeyDown={(event) => {
          if (!recording) return;
          event.preventDefault();
          setRecording(undefined);
        }}
        className="gap-0 overflow-hidden bg-card p-0 sm:max-w-3xl"
      >
        <div className="flex items-center justify-between border-b p-4">
          <DialogTitle className="flex items-center gap-3 font-semibold">
            <Keyboard aria-hidden className="size-5 text-state-waiting" /> Keyboard Shortcuts
          </DialogTitle>
          <DialogDescription className="sr-only">Mesa's keyboard shortcuts.</DialogDescription>
          <IconButton label="Close" icon={X} onClick={() => props.onOpenChange(false)} />
        </div>
        <div className="grid max-h-[70vh] gap-8 overflow-y-auto p-5 sm:grid-cols-2">
          <section aria-label="Global">
            <h3 className="mb-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Global
            </h3>
            {CUSTOM.map(({ key, label }) => (
              <CustomShortcut
                key={key}
                name={key}
                label={label}
                shortcuts={shortcuts}
                recording={recording === key}
                onRecording={(on) => setRecording(on ? key : undefined)}
                onChanged={props.onChanged}
              />
            ))}
            <ShortcutRow label="Keyboard shortcuts" shortcut={FIXED_SHORTCUTS.keyboardShortcuts} />
          </section>
          <section aria-label="Project view">
            <h3 className="mb-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Project view
            </h3>
            {PROJECT.map(([label, shortcut]) => (
              <ShortcutRow key={label} label={label} shortcut={shortcut} />
            ))}
          </section>
        </div>
        <p className="border-t px-4 py-3 text-center text-xs text-muted-foreground">
          Hover over a shortcut and click the pencil to customize it
        </p>
      </DialogContent>
    </Dialog>
  );
}

function ShortcutRow(props: { label: string; shortcut: string; children?: React.ReactNode }) {
  return (
    <div className="group flex items-center gap-3 py-2 text-sm">
      <span className="flex-1 text-muted-foreground">{props.label}</span>
      {props.children}
      <span role="img" className="flex gap-1" aria-label={props.shortcut}>
        {keyCaps(props.shortcut).map((cap, index) => (
          <kbd
            // biome-ignore lint/suspicious/noArrayIndexKey: A shortcut's caps are fixed text.
            key={index}
            className="flex min-w-6 items-center justify-center rounded border bg-background px-1.5 py-0.5 font-mono text-xs"
          >
            {cap}
          </kbd>
        ))}
      </span>
    </div>
  );
}

/** A profile shortcut: its pencil records the next combination, refused if invalid or taken. */
function CustomShortcut(props: {
  name: keyof Shortcuts;
  label: string;
  shortcuts: Shortcuts;
  recording: boolean;
  onRecording: (on: boolean) => void;
  onChanged: () => void;
}) {
  const [error, setError] = useState('');
  const run = useRun();
  const { acting, act } = useAct();
  const record = (event: React.KeyboardEvent) => {
    // Escape is the dialog's (onEscapeKeyDown), which cancels the recording.
    if (event.key === 'Escape') return;
    event.preventDefault();
    event.stopPropagation();
    if (['Meta', 'Control', 'Shift', 'Alt'].includes(event.key)) return;
    const value = shortcutFromKeys(event);
    if (!value) return setError('Use Mod plus a letter or digit; common window keys are reserved.');
    const taken =
      CUSTOM.find(({ key }) => key !== props.name && props.shortcuts[key] === value)?.label ??
      FIXED.find(([, shortcut]) => shortcut === value)?.[0];
    if (taken) return setError(`Already used by ${taken}.`);
    props.onRecording(false);
    setError('');
    if (value === props.shortcuts[props.name]) return;
    void act(async () => {
      const result = await run('config.set', { path: `shortcuts.${props.name}`, value });
      if (!result) return undefined;
      props.onChanged();
      return said(`Saved ${props.label} shortcut`, result);
    });
  };
  return (
    <div>
      <ShortcutRow label={props.label} shortcut={props.shortcuts[props.name]}>
        {props.recording ? (
          <button
            type="button"
            data-testid={`shortcut-${props.name}`}
            // biome-ignore lint/a11y/noAutofocus: recording starts where the pencil was pressed.
            autoFocus
            className="rounded border border-state-working px-2 py-0.5 text-xs text-state-working"
            onKeyDown={record}
            onBlur={() => props.onRecording(false)}
          >
            Press keys...
          </button>
        ) : (
          <IconButton
            label={`Customize ${props.label}`}
            icon={Pencil}
            size="icon-xs"
            disabled={acting}
            className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
            onClick={() => {
              setError('');
              props.onRecording(true);
            }}
          />
        )}
      </ShortcutRow>
      {error && (
        <p role="alert" className="pb-2 text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
