import { Copy, MessageSquareQuote } from 'lucide-react';
import { useToast } from '@/components/Toast';
import { Button } from '@/components/ui/button';
import { usePlatform } from '@/lib/MesaRoot';
import { useCommand } from '@/lib/useCommand';
import { SettingRow } from './SettingRow';

/** Where the profile's Review voice lives and whether it is set; the person edits it in their editor. */
export function ReviewVoiceRow() {
  const voice = useCommand('prs.voice');
  const { clipboard } = usePlatform();
  const toast = useToast();
  const path = voice.data?.path;
  return (
    <SettingRow
      icon={MessageSquareQuote}
      title="Review voice"
      description="Review sessions write their comments the way this file describes: tone, length, how you phrase a suggestion. Edit it in your editor."
      keywords="pr pull request review comments voice tone style"
      control={
        path ? (
          <Button
            size="sm"
            variant="ghost"
            onClick={async () => {
              await clipboard.write(path);
              toast('Path copied', 'confirmation');
            }}
          >
            <Copy aria-hidden /> Copy path
          </Button>
        ) : null
      }
    >
      {path ? (
        <p data-testid="review-voice" className="text-xs text-muted-foreground">
          <span className="font-medium text-foreground">
            {voice.data?.text ? 'Set' : 'Not set'}
          </span>{' '}
          <code className="font-mono">{path}</code>
        </p>
      ) : null}
    </SettingRow>
  );
}
