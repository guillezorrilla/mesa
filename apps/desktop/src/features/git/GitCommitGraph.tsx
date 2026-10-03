import type { GitGraphCommit } from '@mesa/core';
import { useMemo } from 'react';
import { shortAgo } from '@/lib/timeAgo';
import { cn } from '@/lib/utils';
import { graphLanes, type LaneEdge } from './graphLanes';

const ROW = 40;
const LANE = 24;
const DOT = 5.5;
const PAD = 16;

const x = (column: number) => PAD + column * LANE + LANE / 2;
const y = (row: number) => row * ROW + ROW / 2;
const laneColor = (color: number) => `var(--series-${color + 1})`;

/** Branch names on a commit, without HEAD, a remote's HEAD or tags; local and remote stay apart. */
export function branchRefs(refs: string[]) {
  return refs
    .filter((ref) => ref !== 'HEAD' && !ref.endsWith('/HEAD') && !ref.startsWith('tag: '))
    .map((ref) => ref.replace(/^HEAD -> /, ''));
}

/** One lane line: straight in a lane, otherwise a curve where it changes lane. */
function Edge(props: { edge: LaneEdge }) {
  const { fromRow, fromColumn, toRow, toColumn, color } = props.edge;
  const [x1, y1, x2, y2] = [x(fromColumn), y(fromRow), x(toColumn), y(toRow)];
  const stroke = { stroke: laneColor(color), strokeWidth: 2, strokeOpacity: 0.6, fill: 'none' };
  if (x1 === x2) return <line x1={x1} y1={y1} x2={x2} y2={y2} {...stroke} />;
  /** An S-curve over one row, from this line's lane to its parent's. */
  const bend = (top: number) =>
    `C ${x1} ${top + ROW * 0.6}, ${x2} ${top + ROW * 0.4}, ${x2} ${top + ROW}`;
  // A branch leaves its parent lane at once; a line rejoining a lane on its left bends last.
  const d =
    x2 > x1
      ? `M ${x1} ${y1} ${bend(y1)} L ${x2} ${y2}`
      : `M ${x1} ${y1} L ${x1} ${y2 - ROW} ${bend(y2 - ROW)}`;
  return <path d={d} {...stroke} />;
}

/** Commits newest first, each on its lane of the drawn graph, with branch names and age. */
export function GitCommitGraph(props: {
  commits: GitGraphCommit[];
  selected?: string;
  onSelect: (commit: GitGraphCommit) => void;
}) {
  const { rows, edges, columns } = useMemo(() => graphLanes(props.commits), [props.commits]);
  const width = PAD * 2 + columns * LANE;
  return (
    <div className="relative" style={{ height: props.commits.length * ROW }}>
      <svg
        aria-hidden
        width={width}
        height={props.commits.length * ROW}
        className="pointer-events-none absolute top-0 left-0"
      >
        {edges.map((edge) => (
          <Edge key={`${edge.fromRow}:${edge.toRow}`} edge={edge} />
        ))}
        {props.commits.map((commit, row) => {
          const lane = rows[row] ?? { column: 0, color: 0 };
          const head = commit.refs.some((ref) => ref === 'HEAD' || ref.startsWith('HEAD -> '));
          return (
            <g key={commit.oid}>
              {props.selected === commit.oid && (
                <circle
                  cx={x(lane.column)}
                  cy={y(row)}
                  r={DOT + 3.5}
                  fill="none"
                  stroke="var(--foreground)"
                  strokeOpacity={0.5}
                  strokeWidth={1.5}
                />
              )}
              <circle
                cx={x(lane.column)}
                cy={y(row)}
                r={head ? DOT + 1.5 : DOT}
                fill={laneColor(lane.color)}
                stroke={head ? 'var(--foreground)' : 'none'}
                strokeWidth={1.5}
              />
            </g>
          );
        })}
      </svg>
      <ul aria-label="Commits">
        {props.commits.map((commit, row) => {
          const color = laneColor(rows[row]?.color ?? 0);
          const names = branchRefs(commit.refs);
          return (
            <li key={commit.oid}>
              <button
                type="button"
                aria-current={props.selected === commit.oid || undefined}
                title={`${commit.author}, ${new Date(commit.authoredAt).toLocaleString()}`}
                className={cn(
                  'group flex h-10 w-full items-center gap-2.5 pr-4 text-left transition-colors hover:bg-accent/50',
                  props.selected === commit.oid && 'bg-accent hover:bg-accent',
                )}
                style={{ paddingLeft: width }}
                onClick={() => props.onSelect(commit)}
              >
                <span className="shrink-0 font-mono text-xs text-muted-foreground/70 group-hover:text-muted-foreground">
                  {commit.oid.slice(0, 7)}
                </span>
                <span className="min-w-0 flex-1 truncate text-sm text-foreground/85 group-hover:text-foreground">
                  {commit.subject}
                </span>
                {names.slice(0, 2).map((name) => (
                  <span
                    key={name}
                    className="max-w-40 shrink-0 truncate rounded px-1.5 py-0.5 text-[10px] font-medium"
                    style={{
                      color,
                      backgroundColor: `color-mix(in oklab, ${color} 18%, transparent)`,
                    }}
                  >
                    {name}
                  </span>
                ))}
                {names.length > 2 && (
                  <span className="shrink-0 text-[10px] text-muted-foreground">
                    +{names.length - 2}
                  </span>
                )}
                <span className="w-10 shrink-0 text-right text-xs text-muted-foreground/70">
                  {shortAgo(commit.authoredAt)}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
