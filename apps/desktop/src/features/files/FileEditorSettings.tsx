import type { Config } from '@mesa/core';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';

/** The profile's editor preferences, each saved as soon as it changes. */
export function FileEditorSettings(props: {
  preferences: Config['editor'];
  disabled: boolean;
  onSave: (key: keyof Config['editor'], value: unknown) => void;
}) {
  const [externalDraft, setExternalDraft] = useState('');
  const [externalError, setExternalError] = useState('');
  useEffect(() => {
    setExternalDraft(JSON.stringify(props.preferences.external));
    setExternalError('');
  }, [props.preferences.external]);
  return (
    <section className="shrink-0 border-b p-3 text-xs" aria-label="Editor settings">
      <div className="flex flex-wrap items-center gap-3">
        <Label htmlFor="editor-font-size">Font size</Label>
        <NativeSelect
          id="editor-font-size"
          aria-label="Editor font size"
          value={props.preferences.fontSize}
          disabled={props.disabled}
          onChange={(event) => void props.onSave('fontSize', Number(event.target.value))}
        >
          {[10, 11, 12, 13, 14, 16, 18, 20, 24].map((size) => (
            <NativeSelectOption key={size} value={size}>
              {size}
            </NativeSelectOption>
          ))}
        </NativeSelect>
        <Label htmlFor="editor-tab-size">Tab size</Label>
        <NativeSelect
          id="editor-tab-size"
          aria-label="Editor tab size"
          value={props.preferences.tabSize}
          disabled={props.disabled}
          onChange={(event) => void props.onSave('tabSize', Number(event.target.value))}
        >
          {[2, 4, 8].map((size) => (
            <NativeSelectOption key={size} value={size}>
              {size}
            </NativeSelectOption>
          ))}
        </NativeSelect>
        <div className="flex items-center gap-1">
          <Checkbox
            id="editor-word-wrap"
            checked={props.preferences.wordWrap}
            disabled={props.disabled}
            onCheckedChange={(checked) => void props.onSave('wordWrap', checked === true)}
          />
          <Label htmlFor="editor-word-wrap">Wrap lines</Label>
        </div>
        <div className="flex items-center gap-1">
          <Checkbox
            id="editor-vim"
            checked={props.preferences.vim}
            disabled={props.disabled}
            onCheckedChange={(checked) => void props.onSave('vim', checked === true)}
          />
          <Label htmlFor="editor-vim">Vim mode</Label>
        </div>
      </div>
      <form
        className="mt-3 flex gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          try {
            const parsed: unknown = JSON.parse(externalDraft);
            if (!Array.isArray(parsed) || !parsed.every((arg) => typeof arg === 'string'))
              throw new Error('Enter a JSON array of argument strings.');
            void props.onSave('external', parsed);
          } catch {
            setExternalError('Enter a JSON array of argument strings.');
          }
        }}
      >
        <Input
          aria-label="External editor argv"
          className="min-w-0 flex-1 font-mono"
          value={externalDraft}
          onChange={(event) => {
            setExternalDraft(event.target.value);
            setExternalError('');
          }}
          placeholder='["/usr/bin/open","-a","TextEdit","{file}"]'
        />
        <Button type="submit" size="sm" variant="outline" disabled={props.disabled}>
          Save argv
        </Button>
      </form>
      {externalError && (
        <p role="alert" className="mt-1 text-destructive">
          {externalError}
        </p>
      )}
      <p className="mt-1 text-muted-foreground">
        Absolute executable, with a {'{file}'} argument and optional {'{line}'}.
      </p>
    </section>
  );
}
