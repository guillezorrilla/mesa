import type { CanvasData, CanvasNode } from '@mesa/core';
import { mapSession } from '@mesa/core/browser';
import { useId, useState } from 'react';
import { Button } from './ui/button';

/** The point on a node's border facing the other endpoint, in saved Canvas coordinates. */
function endpoint(node: CanvasNode, other: CanvasNode) {
  const x = node.x + node.width / 2;
  const y = node.y + node.height / 2;
  const dx = other.x + other.width / 2 - x;
  const dy = other.y + other.height / 2 - y;
  const scale = Math.max(Math.abs(dx) / (node.width / 2), Math.abs(dy) / (node.height / 2));
  return scale > 0 ? { x: x + dx / scale, y: y + dy / scale } : { x, y };
}

/** A read-only saved Canvas: SVG geometry and native buttons share exact navigation targets. */
export function CanvasView(props: {
  canvas: CanvasData;
  onSession: (id: string) => void;
  onVaultItem: (path: string) => void;
}) {
  const { nodes, edges } = props.canvas;
  const [fit, setFit] = useState(true);
  const arrow = useId();
  const byId = new Map(nodes.map((node) => [node.id, node]));
  // Space around saved bounds also contains a self-edge's loop and arrow.
  const padding = 60;
  const left = Math.min(...nodes.map((node) => node.x)) - padding;
  const top = Math.min(...nodes.map((node) => node.y)) - padding;
  const width = Math.max(...nodes.map((node) => node.x + node.width)) - left + padding;
  const height = Math.max(...nodes.map((node) => node.y + node.height)) - top + padding;
  return (
    <div className="space-y-2">
      <Button variant="outline" onClick={() => setFit((last) => !last)}>
        {fit ? 'Actual size and scroll' : 'Fit map'}
      </Button>
      <div className="max-h-[70vh] overflow-auto rounded-lg border">
        <svg
          aria-label="Saved session map"
          viewBox={`${left} ${top} ${width} ${height}`}
          width={width}
          height={height}
          className={fit ? 'h-auto w-full' : undefined}
        >
          <title>Saved session map</title>
          <defs>
            <marker
              id={arrow}
              viewBox="0 0 10 10"
              refX="10"
              refY="5"
              markerWidth="8"
              markerHeight="8"
              orient="auto-start-reverse"
            >
              <path d="M 0 0 L 10 5 L 0 10 z" className="fill-foreground" />
            </marker>
          </defs>
          {nodes
            .filter((node) => node.type === 'group')
            .map((node) => (
              <g
                key={node.id}
                data-canvas-node={node.id}
                aria-label={`Group ${node.label || node.id}`}
              >
                <rect
                  x={node.x}
                  y={node.y}
                  width={node.width}
                  height={node.height}
                  rx="8"
                  className="fill-muted/30 stroke-border"
                />
                <text x={node.x + 12} y={node.y + 28} className="fill-foreground text-sm">
                  {node.label || node.id}
                </text>
              </g>
            ))}
          {edges.map((edge) => {
            const from = byId.get(edge.fromNode);
            const to = byId.get(edge.toNode);
            if (!from || !to) return null; // The shared reader validates these references.
            const start = endpoint(from, to);
            const end = endpoint(to, from);
            const loop = start.x === end.x && start.y === end.y;
            const right = from.x + from.width;
            const center = from.x + from.width / 2;
            return (
              <g
                key={edge.id}
                data-canvas-edge={edge.id}
                data-from={edge.fromNode}
                data-to={edge.toNode}
              >
                <title>{edge.label || `${edge.fromNode} to ${edge.toNode}`}</title>
                {loop ? (
                  <path
                    d={`M ${right} ${start.y} C ${right + 40} ${start.y} ${right + 40} ${from.y - 40} ${center} ${from.y - 40} L ${center} ${from.y}`}
                    markerEnd={`url(#${arrow})`}
                    className="fill-none stroke-foreground"
                    strokeWidth="2"
                  />
                ) : (
                  <line
                    x1={start.x}
                    y1={start.y}
                    x2={end.x}
                    y2={end.y}
                    markerEnd={`url(#${arrow})`}
                    className="stroke-foreground"
                    strokeWidth="2"
                  />
                )}
                {edge.label && (
                  <text
                    x={(start.x + end.x) / 2}
                    y={(start.y + end.y) / 2}
                    className="fill-foreground text-xs"
                  >
                    {edge.label}
                  </text>
                )}
              </g>
            );
          })}
          {nodes
            .filter((node) => node.type !== 'group')
            .map((node) => {
              const session = mapSession(node);
              const label =
                node.type === 'file' ? node.file : node.type === 'text' ? node.text : node.url;
              return (
                <foreignObject
                  key={node.id}
                  data-canvas-node={node.id}
                  x={node.x}
                  y={node.y}
                  width={node.width}
                  height={node.height}
                >
                  <div className="flex h-full flex-col overflow-hidden rounded-lg border bg-card">
                    {node.type === 'file' ? (
                      <>
                        <Button
                          variant="ghost"
                          className="min-h-0 w-full flex-1 items-start justify-start overflow-hidden rounded-none p-3"
                          aria-label={`Open vault file ${node.file}`}
                          onClick={() => props.onVaultItem(node.file)}
                        >
                          <span className="truncate">{node.file}</span>
                        </Button>
                        {session && (
                          <Button
                            variant="outline"
                            className="m-3 mt-0 shrink-0"
                            aria-label={`Open session ${session.id}`}
                            onClick={() => props.onSession(session.id)}
                          >
                            Open session {session.id}
                          </Button>
                        )}
                      </>
                    ) : session ? (
                      <Button
                        variant="ghost"
                        className="min-h-0 w-full flex-1 flex-col items-start justify-start gap-2 overflow-hidden rounded-none p-3 text-left"
                        aria-label={`Open session ${session.id}: ${session.label}`}
                        onClick={() => props.onSession(session.id)}
                      >
                        <span className="max-w-full truncate">{session.label}</span>
                        <span className="line-clamp-5 whitespace-pre-line text-sm font-normal">
                          {label.split('\n').slice(1).join('\n')}
                        </span>
                      </Button>
                    ) : (
                      <p className="line-clamp-6 whitespace-pre-line p-3 text-sm">{label}</p>
                    )}
                  </div>
                </foreignObject>
              );
            })}
        </svg>
      </div>
    </div>
  );
}
