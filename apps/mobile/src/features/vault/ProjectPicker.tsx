import { Pressable, View } from 'react-native';
import { Text } from '@/components/ui/text';
import { cn } from '@/lib/utils';

/** The registered projects as chips, the picked one filled. */
export function ProjectPicker({
  projects,
  picked,
  onPick,
}: {
  projects: { name: string; label: string }[];
  picked: string;
  onPick: (name: string) => void;
}) {
  return (
    <View accessibilityRole="radiogroup" className="flex-row flex-wrap gap-2">
      {projects.map((project) => {
        const on = project.name === picked;
        return (
          <Pressable
            key={project.name}
            accessibilityRole="radio"
            accessibilityState={{ checked: on }}
            onPress={() => onPick(project.name)}
            className={cn(
              'min-h-9 justify-center rounded-full border px-3 active:opacity-70',
              on ? 'border-primary bg-primary' : 'border-border bg-card',
            )}
          >
            <Text className={cn('text-sm', on && 'font-medium text-primary-foreground')}>
              {project.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
