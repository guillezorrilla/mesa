import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';

/**
 * Paste a link to import: a Jira issue or key, a Confluence or Notion page, or any public web page, with the
 * Write notes toggle every import shares. Cleared once the import ran.
 */
export function PasteLinkForm(props: {
  acting: boolean;
  notes: boolean;
  onNotesChange: (notes: boolean) => void;
  onImport: (links: string[]) => Promise<boolean>;
}) {
  const [link, setLink] = useState('');
  return (
    <form
      className="flex flex-wrap items-center gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        if (link.trim()) void props.onImport([link.trim()]).then((ran) => ran && setLink(''));
      }}
    >
      <Input
        aria-label="Link to import"
        placeholder="Paste a Jira, Confluence, Notion, or any public web link"
        value={link}
        onChange={(event) => setLink(event.target.value)}
        className="min-w-64 flex-1"
      />
      <Label className="flex items-center gap-2 text-sm font-normal">
        <Switch
          checked={props.notes}
          onCheckedChange={props.onNotesChange}
          aria-label="Write notes"
        />
        Write notes
      </Label>
      <Button type="submit" size="sm" disabled={props.acting || !link.trim()}>
        {props.acting ? 'Importing...' : 'Import'}
      </Button>
    </form>
  );
}
