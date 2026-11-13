import { useLocalSearchParams } from 'expo-router';
import { NoteScreen } from '@/features/vault/NoteScreen';

/** One vault item, `/vault/note?path=<vault path>`: from a list, a search, or a link in a note. */
export default function Note() {
  const { path } = useLocalSearchParams<{ path: string }>();
  return <NoteScreen path={path} />;
}
