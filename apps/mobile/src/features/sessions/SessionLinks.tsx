import { type Href, router } from 'expo-router';
import FolderOpen from 'lucide-react-native/icons/folder-open';
import GitBranch from 'lucide-react-native/icons/git-branch';
import GitCompare from 'lucide-react-native/icons/git-compare';
import { View } from 'react-native';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';

/** Where a session's work is reviewed: its changes, its source control and its files. */
export function SessionLinks({ id }: { id: string }) {
  const links: { label: string; icon: typeof GitCompare; href: Href }[] = [
    { label: 'Changes', icon: GitCompare, href: `/agents/changes/${id}` },
    { label: 'Git', icon: GitBranch, href: `/agents/git/${id}` },
    { label: 'Files', icon: FolderOpen, href: `/agents/files/${id}` },
  ];
  return (
    <View className="flex-row gap-2">
      {links.map((link) => (
        <Button
          key={link.label}
          variant="secondary"
          size="sm"
          className="flex-1"
          onPress={() => router.push(link.href)}
        >
          <Icon as={link.icon} className="size-4" />
          <Text>{link.label}</Text>
        </Button>
      ))}
    </View>
  );
}
