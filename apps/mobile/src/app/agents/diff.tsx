import { useLocalSearchParams } from 'expo-router';
import { DiffScreen } from '@/features/changes/DiffScreen';

/** One changed file's diff, `/agents/diff?id=<session>&path=<file>`. */
export default function Diff() {
  const { id, path } = useLocalSearchParams<{ id: string; path: string }>();
  return <DiffScreen id={id} path={path} />;
}
