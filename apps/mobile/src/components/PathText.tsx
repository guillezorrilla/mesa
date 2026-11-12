import { Text } from '@/components/ui/text';
import { pathParts } from '@/lib/pathParts';
import { cn } from '@/lib/utils';

/** A file path on one line: its folder dimmed, its name in full weight; cut at the head. */
export function PathText({ path, muted }: { path: string; muted?: boolean }) {
  const { folder, name } = pathParts(path);
  return (
    <Text numberOfLines={1} ellipsizeMode="head" className="font-mono text-sm">
      <Text className="font-mono text-sm text-muted-foreground">{folder ? `${folder}/` : ''}</Text>
      <Text className={cn('font-mono text-sm font-medium', muted && 'text-muted-foreground')}>
        {name}
      </Text>
    </Text>
  );
}
