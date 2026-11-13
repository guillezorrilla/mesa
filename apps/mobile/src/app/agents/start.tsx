import { useLocalSearchParams } from 'expo-router';
import { StartScreen } from '@/features/start/StartScreen';

/** A new session, `/agents/start`: from the + button, or from a ticket (`project`, `from`, `title`). */
export default function Start() {
  const params = useLocalSearchParams<{ project?: string; from?: string; title?: string }>();
  return <StartScreen project={params.project} from={params.from} title={params.title} />;
}
