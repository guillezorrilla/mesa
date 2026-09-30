import { z } from 'zod';

// JSON Canvas 1.0's structured geometry, shared by the scoped reader and map callers.
const geometry = {
  id: z.string(),
  x: z.number().int(),
  y: z.number().int(),
  width: z.number().int(),
  height: z.number().int(),
};
const node = z.discriminatedUnion('type', [
  z.object({ ...geometry, type: z.literal('text'), text: z.string() }),
  z.object({
    ...geometry,
    type: z.literal('file'),
    file: z.string(),
    subpath: z.string().optional(),
  }),
  z.object({ ...geometry, type: z.literal('link'), url: z.string() }),
  z.object({ ...geometry, type: z.literal('group'), label: z.string().optional() }),
]);
const schema = z.object({
  nodes: z.array(node).default([]),
  edges: z
    .array(
      z.object({
        id: z.string(),
        fromNode: z.string(),
        toNode: z.string(),
        label: z.string().optional(),
      }),
    )
    .default([]),
});
export type CanvasData = z.infer<typeof schema>;
export type CanvasNode = CanvasData['nodes'][number];
export type CanvasEdge = CanvasData['edges'][number];

/** Structured Canvas geometry, or null when malformed; legacy text/count previews remain usable. */
export function parseCanvas(input: unknown): CanvasData | null {
  const parsed = schema.safeParse(input);
  if (!parsed.success) return null;
  const { nodes, edges } = parsed.data;
  const ids = new Set(nodes.map((n) => n.id));
  if (ids.size !== nodes.length || new Set(edges.map((e) => e.id)).size !== edges.length)
    return null;
  if (edges.some((e) => !ids.has(e.fromNode) || !ids.has(e.toNode))) return null;
  return parsed.data;
}
