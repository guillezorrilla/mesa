import type { SavedPrompt, SessionImage } from '@mesa/core';
import { ImagePlus, Send } from 'lucide-react';
import type { RefObject } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { SavedPromptPicker } from '@/features/prompts/SavedPromptPicker';

/** The selected session's prompt: text, a saved prompt, or an attached image, and Send. */
export function PromptComposer(props: {
  sessionId: string;
  acting: boolean;
  /** The image picked, attached only when it was picked for this session. */
  image?: SessionImage;
  promptField: RefObject<HTMLTextAreaElement | null>;
  savedPrompts?: readonly SavedPrompt[];
  onInsert: (text: string) => void;
  onSend: (prompt: string, form: HTMLFormElement, image?: SessionImage) => void;
  onPickImage: () => void;
  onClearImage: () => void;
}) {
  const image = props.image?.session === props.sessionId ? props.image : undefined;
  return (
    <div className="flex min-w-48 flex-1 flex-col gap-2">
      <form
        className="flex gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          if (!props.acting)
            props.onSend(
              String(new FormData(event.currentTarget).get('prompt') ?? ''),
              event.currentTarget,
              image,
            );
        }}
      >
        <Textarea
          ref={props.promptField}
          name="prompt"
          aria-label={`Prompt for ${props.sessionId}`}
          placeholder="Message session"
          rows={2}
          className="min-h-9 flex-1 resize-y"
        />
        <SavedPromptPicker prompts={props.savedPrompts} onSelect={props.onInsert} />
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={props.acting}
          onClick={props.onPickImage}
          aria-label="Attach image"
        >
          <ImagePlus aria-hidden />
        </Button>
        <Button type="submit" size="sm" disabled={props.acting}>
          <Send aria-hidden /> {image ? 'Send image' : 'Send'}
        </Button>
      </form>
      {image && (
        <div className="flex items-center gap-2 rounded border p-2 text-xs">
          <img
            src={image.dataUrl}
            alt={`Selected image: ${image.name}`}
            className="max-h-24 max-w-36 object-contain"
          />
          <span className="min-w-0 flex-1 truncate">{image.name}</span>
          <Button size="sm" variant="ghost" onClick={props.onClearImage}>
            Remove image
          </Button>
        </div>
      )}
    </div>
  );
}
