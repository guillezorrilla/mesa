import ArrowUp from 'lucide-react-native/icons/arrow-up';
import ImagePlus from 'lucide-react-native/icons/image-plus';
import { Suspense } from 'react';
import { Pressable, TextInput, View } from 'react-native';
import { Icon } from '@/components/ui/icon';
import { cn } from '@/lib/utils';
import { appended } from './draftMap';
import { PhotoChip } from './PhotoChip';
import { PromptChips } from './PromptChips';
import { SendNote } from './SendNote';
import { SentList } from './SentList';
import { usePrompts } from './usePrompts';
import { useSend } from './useSend';

/**
 * The reply bar under a session: what was sent from here, the last send's note, saved prompts,
 * an attached photo, then attach, the draft and send. iOS's own keyboard dictation types into it.
 */
export function Composer({ id, onSent }: { id: string; onSent: () => void }) {
  const send = useSend(id, onSent);
  const prompts = usePrompts();
  const empty = !send.draft.trim() && !send.photo;
  return (
    <View className="gap-2.5 border-t border-border bg-background px-3 py-2.5">
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
        <Pressable
          onPress={send.attach}
          accessibilityRole="button"
          accessibilityLabel="Attach a photo"
          className="size-11 items-center justify-center rounded-full active:bg-accent"
        >
          <Icon as={ImagePlus} className="size-6 text-muted-foreground" />
        </Pressable>
        <TextInput
          multiline
          value={send.draft}
          onChangeText={send.setDraft}
          placeholder="Reply to this session"
          accessibilityLabel="Reply"
          className="max-h-36 min-h-11 flex-1 rounded-3xl border border-input bg-card px-4 pt-3 pb-3 font-sans text-base text-foreground"
          placeholderTextColorClassName="accent-muted-foreground"
        />
        <Pressable
          onPress={() => send.submit()}
          disabled={empty}
          accessibilityRole="button"
          accessibilityLabel="Send"
          accessibilityState={{ disabled: empty }}
          className={cn(
            'size-11 items-center justify-center rounded-full',
            empty ? 'bg-muted' : 'bg-primary active:bg-primary/90',
          )}
        >
          <Icon
            as={ArrowUp}
            className={cn('size-5', empty ? 'text-muted-foreground' : 'text-primary-foreground')}
          />
        </Pressable>
      </View>
    </View>
  );
}
