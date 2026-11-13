import { CodeBlock } from '@/components/CodeBlock';
import { Markdown } from '@/components/markdown/Markdown';

/** One part of a reply: prose as Markdown, as orca's chat draws it; code as a block to copy. */
export function ReplySegment({ code, text }: { code: boolean; text: string }) {
  return code ? <CodeBlock code={text} /> : <Markdown text={text} />;
}
