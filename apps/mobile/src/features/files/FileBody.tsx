import type { CallResult } from '@mesa/core/phone';
import { use } from 'react';
import { Image } from 'react-native';
import { CodeBlock } from '@/components/CodeBlock';
import { ErrorNote } from '@/components/ErrorNote';
import type { MacRead } from '../mac/tryCall';

/** A file of the worktree: its text to read and copy, or its image. */
export function FileBody({
  path,
  file,
}: {
  path: string;
  file: Promise<MacRead<CallResult<'file'>>>;
}) {
  const { result, error } = use(file);
  if (!result) return <ErrorNote text={error ?? `${path} cannot be shown.`} />;
  if (result.kind === 'text') return <CodeBlock code={result.text} />;
  return (
    <Image
      source={{ uri: `data:${result.mime};base64,${result.data}` }}
      accessibilityLabel={path}
      resizeMode="contain"
      className="aspect-square w-full"
    />
  );
}
