import { useLocalSearchParams } from 'expo-router';
import { DiffScreen } from '@/features/changes/DiffScreen';

/** One changed file's diff, `/agents/diff?id=<session>&path=<file>&rev=<its patch's revision>`. */
export default function Diff() {
  const { id, path, rev } = useLocalSearchParams<{ id: string; path: string; rev: string }>();
  return <DiffScreen id={id} path={path} rev={rev} />;
}
