import { Card, CardHeader } from '@/components/ui/card';
import { Text } from '@/components/ui/text';
import { PromptHeading } from './PromptHeading';
import { UNSUPPORTED_TEXT, UNSUPPORTED_TITLE } from './promptText';

/** A prompt Mesa cannot answer from the phone: it says to answer it at the Mac. */
export function UnsupportedPromptCard() {
  return (
    <Card className="gap-4 border-state-waiting/50 py-4">
      <CardHeader className="gap-2 px-4">
        <PromptHeading title={UNSUPPORTED_TITLE} />
        <Text variant="muted">{UNSUPPORTED_TEXT}</Text>
      </CardHeader>
    </Card>
  );
}
