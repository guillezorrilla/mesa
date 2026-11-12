import ArrowUp from 'lucide-react-native/icons/arrow-up';
import ImagePlus from 'lucide-react-native/icons/image-plus';
import { Suspense } from 'react';
import { View } from 'react-native';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Input } from '@/components/ui/input';
import { appended } from './draftMap';
import { PhotoChip } from './PhotoChip';
import { PromptChips } from './PromptChips';
import { SendNote } from './SendNote';
import { SentList } from './SentList';
import { usePrompts } from './usePrompts';
import { useSend } from './useSend';

/**
 * The reply box under a session: what was sent from here, the last send's note, saved prompts,
 * an attached photo, and the draft. iOS's own keyboard dictation types into it.
 */
export function Composer({ id, onSent }: { id: string; onSent: () => void }) {
  const send = useSend(id, onSent);
  const prompts = usePrompts();
  const empty = !send.draft.trim() && !send.photo;
  return (
    <View className="gap-2 border-t border-border bg-background px-4 py-2">
      <SentList items={send.shown} />
      <SendNote outcome={send.outcome} onSendAnyway={() => send.submit(true)} />
      <Suspense fallback={null}>
        <PromptChips
          prompts={prompts}
          onPick={(text) => send.setDraft(appended(send.draft, text))}
        />
      </Suspense>
      {send.photo ? <PhotoChip uri={send.photo.uri} onRemove={send.clearPhoto} /> : null}
      <View className="flex-row items-end gap-2">
        <Button
          size="icon"
          variant="ghost"
          onPress={send.attach}
          accessibilityLabel="Attach a photo"
        >
          <Icon as={ImagePlus} className="size-6 text-muted-foreground" />
        </Button>
        <Input
          multiline
          value={send.draft}
          onChangeText={send.setDraft}
          placeholder="Reply"
          accessibilityLabel="Reply"
          className="max-h-32 flex-1"
        />
        <Button
          size="icon"
          onPress={() => send.submit()}
          disabled={empty}
          accessibilityLabel="Send"
          className={empty ? 'opacity-50' : undefined}
        >
          <Icon as={ArrowUp} className="size-5 text-primary-foreground" />
        </Button>
      </View>
    </View>
  );
}
