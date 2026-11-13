import { useLocalSearchParams } from 'expo-router';
import { ProjectScreen } from '@/features/vault/ProjectScreen';

/** One project's memory, `/vault/project/<name>`. */
export default function Project() {
  const { name } = useLocalSearchParams<{ name: string }>();
  return <ProjectScreen name={name} />;
}
