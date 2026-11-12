import { CodeBlock } from '@/components/CodeBlock';
import { Text } from '@/components/ui/text';

/** One part of a reply: prose as selectable text, code as a block with its copy button. */
export function ReplySegment({ code, text }: { code: boolean; text: string }) {
  return code ? <CodeBlock code={text} /> : <Text selectable>{text}</Text>;
}
