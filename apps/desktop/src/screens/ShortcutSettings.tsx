import type { Shortcuts } from '@mesa/core';
import { DEFAULT_SHORTCUTS, validShortcut } from '@mesa/core/browser';
import { useEffect, useState } from 'react';
import { PageHeader } from '@/components/PageHeader';
import { said } from '@/components/Toast';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAct } from '@/lib/useAct';
import { useRun } from '@/lib/useCommand';

const ACTIONS: { key: keyof Shortcuts; label: string }[] = [
  { key: 'search', label: 'Search Mesa' },
  { key: 'board', label: 'Go to Board' },
  { key: 'newSession', label: 'New session' },
];

export function ShortcutSettings(props: { shortcuts?: Shortcuts; onChanged: () => void }) {
  const [draft, setDraft] = useState<Shortcuts>(props.shortcuts ?? DEFAULT_SHORTCUTS);
  const run = useRun();
  const { acting, act } = useAct();
  useEffect(() => {
    if (props.shortcuts) setDraft(props.shortcuts);
  }, [props.shortcuts]);
  const saved = props.shortcuts ?? DEFAULT_SHORTCUTS;
  return (
    <section data-testid="shortcut-settings" className="space-y-4">
      <PageHeader
        title="Keyboard shortcuts"
        description="Use Mod for Command on macOS. Add Shift or Alt before one letter or digit. Common window keys are reserved."
      />
      <Card>
        <CardContent className="space-y-4">
          {ACTIONS.map(({ key, label }) => {
            const value = draft[key];
            const invalid = !validShortcut(value);
            const duplicate = ACTIONS.some(
              (other) => other.key !== key && draft[other.key] === value,
            );
            return (
              <div key={key} className="grid gap-2 sm:grid-cols-[1fr_12rem_auto] sm:items-center">
                <Label htmlFor={`shortcut-${key}`}>{label}</Label>
                <Input
                  id={`shortcut-${key}`}
                  data-testid={`shortcut-${key}`}
                  value={value}
                  aria-invalid={invalid || duplicate}
                  onInput={(event) => {
                    const next = event.currentTarget.value;
                    setDraft((was) => ({ ...was, [key]: next }));
                  }}
                  className="font-mono"
                />
                <Button
                  variant="outline"
                  size="sm"
                  data-testid={`save-shortcut-${key}`}
                  disabled={acting || invalid || duplicate || value === saved[key]}
                  onClick={() =>
                    void act(async () => {
                      const result = await run('config.set', { path: `shortcuts.${key}`, value });
                      if (!result) return undefined;
                      props.onChanged();
                      return said(`Saved ${label} shortcut`, result);
                    })
                  }
                >
                  Save
                </Button>
                {(invalid || duplicate) && (
                  <p className="text-destructive text-xs sm:col-start-2" role="alert">
                    {duplicate
                      ? 'Already used by another action.'
                      : 'Use Mod plus a letter or digit.'}
                  </p>
                )}
              </div>
            );
          })}
        </CardContent>
      </Card>
    </section>
  );
}
