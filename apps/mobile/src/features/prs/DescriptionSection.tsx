import { Section } from '@/components/Section';
import { Text } from '@/components/ui/text';

/** The PR's description as its author wrote it, plain text: provider text is never rendered. */
export function DescriptionSection({ body }: { body: string }) {
  return (
    <Section title="Description">
      <Text selectable className={body.trim() ? 'leading-6' : 'text-muted-foreground'}>
        {body.trim() || 'No description.'}
      </Text>
    </Section>
  );
}
