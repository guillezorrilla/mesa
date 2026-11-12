import { useLocalSearchParams } from 'expo-router';
import { FileScreen } from '@/features/files/FileScreen';

/** One file of a session's worktree, `/agents/file?id=<session>&path=<file>`. */
export default function File() {
  const { id, path } = useLocalSearchParams<{ id: string; path: string }>();
  return <FileScreen id={id} path={path} />;
}
