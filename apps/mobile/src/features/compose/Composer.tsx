import ArrowUp from 'lucide-react-native/icons/arrow-up';
import ImagePlus from 'lucide-react-native/icons/image-plus';
import { Suspense } from 'react';
import { View } from 'react-native';
import { RoundButton } from '@/components/RoundButton';
import { Input } from '@/components/ui/input';
import { appended } from './draftMap';
import { PhotoChip } from './PhotoChip';
import { PromptChips } from './PromptChips';
import { SendNote } from './SendNote';
import { usePrompts } from './usePrompts';
import type { Reply } from './useReply';

/**
 * The reply bar under a session: the last send's note, saved prompts, an attached photo, then one
 * floating box as orca's composer, the draft over attach and send; what was sent shows in the
 * conversation above. iOS's own keyboard dictation types into it.
 */
export function Composer({ reply }: { reply: Reply }) {
  const { photo, setPhoto, attach, send } = reply;
  const prompts = usePrompts();
  const empty = !send.draft.trim() && !photo;
  const submit = (yes = false) => {
    send.submit(photo, yes);
    setPhoto(undefined);
  };
  return (
    <View className="gap-2.5 bg-background px-3 pt-1.5 pb-2">
      <SendNote outcome={send.outcome} onSendAnyway={() => submit(true)} />
      <Suspense fallback={null}>
        <PromptChips
          prompts={prompts}
          onPick={(text) => send.setDraft(appended(send.draft, text))}
        />
      </Suspense>
      {photo ? <PhotoChip uri={photo.uri} onRemove={() => setPhoto(undefined)} /> : null}
      <View className="rounded-3xl border border-border bg-card p-3">
        <Input
          multiline
          value={send.draft}
          onChangeText={send.setDraft}
          placeholder="Reply to this session"
          accessibilityLabel="Reply"
          className="max-h-40 min-h-8 rounded-none border-0 bg-transparent px-1.5 py-1 shadow-none dark:bg-transparent"
        />
        <View className="mt-2 flex-row items-center justify-between">
          <RoundButton icon={ImagePlus} label="Attach a photo" onPress={attach} />
          <RoundButton
            icon={ArrowUp}
            label="Send"
            bright={!empty}
            disabled={empty}
            onPress={() => submit()}
          />
        </View>
      </View>
    </View>
  );
}
