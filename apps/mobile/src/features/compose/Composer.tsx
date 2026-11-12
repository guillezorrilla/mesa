import ArrowUp from 'lucide-react-native/icons/arrow-up';
import ImagePlus from 'lucide-react-native/icons/image-plus';
import { Suspense } from 'react';
import { View } from 'react-native';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { appended } from './draftMap';
import { PhotoChip } from './PhotoChip';
import { PromptChips } from './PromptChips';
import { SendNote } from './SendNote';
import { SentList } from './SentList';
import { usePhoto } from './usePhoto';
import { usePrompts } from './usePrompts';
import { useSend } from './useSend';

/**
 * The reply bar under a session: what was sent from here, the last send's note, saved prompts,
 * an attached photo, then attach, the draft and send. iOS's own keyboard dictation types into it.
 */
export function Composer({ id, onSent }: { id: string; onSent: () => void }) {
  const { photo, setPhoto, attach } = usePhoto();
  const send = useSend(id, { onSent, restorePhoto: setPhoto });
  const prompts = usePrompts();
  const empty = !send.draft.trim() && !photo;
  const submit = (yes = false) => {
    send.submit(photo, yes);
    setPhoto(undefined);
  };
  return (
    <View className="gap-2.5 border-t border-border bg-background px-3 py-2.5">
      <SentList items={send.shown} />
      <SendNote outcome={send.outcome} onSendAnyway={() => submit(true)} />
      <Suspense fallback={null}>
        <PromptChips
          prompts={prompts}
          onPick={(text) => send.setDraft(appended(send.draft, text))}
        />
      </Suspense>
      {photo ? <PhotoChip uri={photo.uri} onRemove={() => setPhoto(undefined)} /> : null}
      <View className="flex-row items-end gap-2">
        <Button
          size="icon"
          variant="ghost"
          className="rounded-full"
          onPress={attach}
          accessibilityLabel="Attach a photo"
        >
          <Icon as={ImagePlus} className="size-6 text-muted-foreground" />
        </Button>
        <Input
          multiline
          value={send.draft}
          onChangeText={send.setDraft}
          placeholder="Reply to this session"
          accessibilityLabel="Reply"
          className="max-h-36 min-h-11 flex-1 rounded-3xl bg-card px-4 py-3 shadow-none"
        />
        <Button
          size="icon"
          // Empty, it shows as secondary, not faded.
          className={cn('rounded-full', empty && 'opacity-100')}
          variant={empty ? 'secondary' : 'default'}
          onPress={() => submit()}
          disabled={empty}
          accessibilityLabel="Send"
        >
          <Icon
            as={ArrowUp}
            className={empty ? 'size-5 text-muted-foreground' : 'size-5 text-primary-foreground'}
          />
        </Button>
      </View>
    </View>
  );
}
