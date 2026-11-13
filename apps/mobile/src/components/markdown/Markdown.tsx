import { MarkdownBlocks } from './MarkdownBlocks';
import { markdownTree } from './markdownTree';

/** A PR's, comment's or ticket's text as GitHub shows it: GitHub-flavoured Markdown and the HTML
 *  GitHub allows, drawn as native text with nothing remote loaded. */
export function Markdown({ text }: { text: string }) {
  return <MarkdownBlocks blocks={markdownTree(text)} />;
}
