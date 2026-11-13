// What the Markdown component draws: a small tree read from markdown-it's tokens (markdownTree).

/** A run of text inside a block. */
export type Inline =
  | { type: 'text'; value: string }
  | { type: 'code'; value: string }
  | { type: 'strong' | 'em' | 'del'; children: Inline[] }
  | { type: 'link'; href: string; children: Inline[] };

/** A list item; `checked` is a task list item's box, null for a plain item. */
export type Item = { type: 'item'; checked: boolean | null; children: Block[] };

export type Cell = { type: 'cell'; header: boolean; children: Inline[] };
export type Row = { type: 'row'; children: Cell[] };

/** A block of a document, top to bottom. */
export type Block =
  | { type: 'paragraph'; children: Inline[] }
  | { type: 'heading'; depth: number; children: Inline[] }
  | { type: 'code'; value: string }
  | { type: 'quote'; children: Block[] }
  | { type: 'list'; ordered: boolean; start: number; children: Item[] }
  | { type: 'table'; children: Row[] }
  | { type: 'details'; open: boolean; summary: Inline[]; children: Block[] }
  | { type: 'rule' };
