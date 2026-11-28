import type { CSSProperties } from 'react';
import type { PixelMap } from './sprites';

/**
 * A pixel map drawn as crisp squares, `scale` screen pixels each: every letter in `palette` is a
 * colour, and the rest is empty. Decoration only; what it shows is said in words beside it.
 */
export function PixelSprite(props: {
  map: PixelMap;
  palette: Readonly<Record<string, string>>;
  scale: number;
  className?: string;
  style?: CSSProperties;
}) {
  const { map, palette, scale } = props;
  const runs: { x: number; y: number; width: number; fill: string }[] = [];
  map.forEach((line, y) => {
    for (let x = 0; x < line.length; ) {
      const letter = line[x] as string;
      let end = x + 1;
      while (line[end] === letter) end++;
      const fill = palette[letter];
      if (fill) runs.push({ x, y, width: end - x, fill });
      x = end;
    }
  });
  const width = map[0]?.length ?? 0;
  return (
    <svg
      aria-hidden
      className={props.className}
      style={props.style}
      width={width * scale}
      height={map.length * scale}
      viewBox={`0 0 ${width} ${map.length}`}
      shapeRendering="crispEdges"
    >
      {runs.map((run) => (
        <rect
          key={`${run.x},${run.y}`}
          x={run.x}
          y={run.y}
          width={run.width}
          height={1}
          style={{ fill: run.fill }}
        />
      ))}
    </svg>
  );
}
