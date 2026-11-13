import { usePhoto } from './usePhoto';
import { useSend } from './useSend';

/**
 * A session screen's reply: its attached photo and its send, held by the screen so its sends show
 * in the conversation; `onSent` reads the session again.
 */
export function useReply(id: string, onSent: () => void) {
  const photo = usePhoto();
  const send = useSend(id, { onSent, restorePhoto: photo.setPhoto });
  return { ...photo, send };
}

export type Reply = ReturnType<typeof useReply>;
