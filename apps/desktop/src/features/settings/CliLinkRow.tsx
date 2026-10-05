import { Copy } from 'lucide-react';
import { useToast } from '@/components/Toast';
import { Button } from '@/components/ui/button';
import { usePlatform } from '@/lib/MesaRoot';
import { SettingRow } from './SettingRow';

/** The README's link that puts the app's `mesa` on a terminal's PATH. */
const LINK_COMMAND =
  'mkdir -p ~/.local/bin && ln -s /Applications/Mesa.app/Contents/MacOS/mesa ~/.local/bin/mesa';

/** How to run `mesa` from a terminal: sessions Mesa starts already find it. */
export function CliLinkRow() {
  const { clipboard } = usePlatform();
  const toast = useToast();
  return (
    <SettingRow
      title="Use mesa from a terminal"
      description="Sessions Mesa starts already find it. To run it yourself, link it once."
      keywords="cli path command line"
      control={
        <Button
          size="sm"
          variant="ghost"
          data-testid="cli-link-copy"
          onClick={async () => {
            await clipboard.write(LINK_COMMAND);
            toast('Command copied', 'confirmation');
          }}
        >
          <Copy aria-hidden /> Copy command
        </Button>
      }
    >
      <code className="block overflow-x-auto rounded-md bg-muted px-3 py-2 font-mono text-xs">
        {LINK_COMMAND}
      </code>
    </SettingRow>
  );
}
