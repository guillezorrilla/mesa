import { Markdown } from '@/components/markdown/Markdown';
import { Section } from '@/components/Section';
import { Text } from '@/components/ui/text';

/** The PR's description as GitHub shows it; nothing in it loads from the web. */
export function DescriptionSection({ body }: { body: string }) {
  return (
    <Section title="Description">
      {body.trim() ? <Markdown text={body} /> : <Text variant="muted">No description.</Text>}
    </Section>
  );
}
