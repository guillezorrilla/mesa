import { useLocalSearchParams } from 'expo-router';
import { PrFilesScreen } from '@/features/prs/PrFilesScreen';

/** A pull request's changed files, `/work/pr-files?project=<project>&number=<n>`. */
export default function PrFiles() {
  const { project, number } = useLocalSearchParams<{ project: string; number: string }>();
  return <PrFilesScreen project={project} number={Number(number)} />;
}
