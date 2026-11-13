import { useLocalSearchParams } from 'expo-router';
import { DecideScreen } from '@/features/vault/DecideScreen';

/** Saving a decision, `/vault/decide[?project=<name>]`. */
export default function Decide() {
  const { project } = useLocalSearchParams<{ project?: string }>();
  return <DecideScreen project={project} />;
}
