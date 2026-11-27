import { contextPercent, sessionTitle } from '@mesa/core/browser';
import { Crown } from 'lucide-react';
import { useEffect, useMemo, useRef } from 'react';
import { Progress } from '@/components/ui/progress';
import { contextTone, toneIndicator } from '@/features/sessions/ContextBar';
import { stateTone } from '@/features/sessions/stateTone';
import { cn } from '@/lib/utils';
import { buildingPlan } from './buildingPlan';
import { FRAME, look } from './characterArt';
import { drawRoom, type Member } from './drawRoom';
import type { Room } from './officeLayout';
import { type Plan, TILE } from './officePlan';
import { officePose } from './officePose';
import {
  type Actor,
  placeActors,
  settleActors,
  stepActors,
  syncActors,
  type Want,
} from './officeSim';
import { PixelSprite } from './PixelSprite';
import { paintRoom } from './paintRoom';
import { sheet } from './pixels';
import { EMOTES } from './sprites';

/** Screen pixels to an art pixel. */
const ZOOM = 2;

/** The cast is kept between visits to the screen, so coming back finds everyone where they were. */
const cast = new Map<string, Actor>();
let castPlan: Plan | undefined;

/**
 * Every project's room as one building, drawn top-down on a canvas: sessions sit at their tables
 * and type, read or wave, idle ones and visitors drift around their room, a PC lights while its
 * session works, and a robot stands by a seat per running subagent. Over each character a button
 * follows it, carrying its bubble and nameplate; it opens the session. A session new to the
 * office walks in from the entry; the rest are found where they belong.
 */
export function OfficeCanvas(props: {
  rooms: readonly Room[];
  /** The widest the building may be, in tiles, before its rooms wrap to a new row. */
  maxCols: number;
  onOpen: (id: string) => void;
  onPeek: (id: string | undefined) => void;
}) {
  const { rooms, maxCols } = props;
  const seats = rooms
    .map((room) => `${room.key}=${room.desks.map((desk) => `${desk.row.id}:${desk.pod}`).join()}`)
    .join('|');
  // biome-ignore lint/correctness/useExhaustiveDependencies: the plan changes with who sits where, not with each look.
  const plan = useMemo(() => buildingPlan(rooms, maxCols), [seats, maxCols]);
  const members: Member[] = rooms.flatMap((room) => [
    ...room.desks.map((desk) => ({
      key: desk.row.id,
      room: room.key,
      row: desk.row,
      family: desk.family,
      pose: officePose(desk.row),
      child: desk.row.id !== desk.pod,
      lead:
        desk.row.id === desk.pod &&
        room.desks.some((other) => other !== desk && other.pod === desk.pod),
      reportsTo: desk.reportsTo,
    })),
    ...room.visitors.map((visitor) => ({
      key: `visit:${visitor.row.id}:${room.key}`,
      room: room.key,
      row: visitor.row,
      family: visitor.family,
      pose: officePose(visitor.row),
      child: false,
      lead: false,
      visitor: visitor.home,
    })),
  ]);
  const wants: Want[] = members.map((member) => ({
    id: member.key,
    room: member.room,
    seat: member.visitor || member.pose.does === 'stroll' ? undefined : plan.seats[member.row.id],
    face: member.pose.does === 'wave' || member.pose.does === 'turn' ? 'down' : undefined,
  }));
  const canvas = useRef<HTMLCanvasElement>(null);
  const markers = useRef(new Map<string, HTMLElement>());
  const live = useRef({ plan, members, wants });
  live.current = { plan, members, wants };
  const reduced =
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const shown = JSON.stringify(members.map((m) => [m.key, m.pose.does, m.pose.state]));

  // biome-ignore lint/correctness/useExhaustiveDependencies: redrawn when the plan or what its members do changes; the loop reads the rest live.
  useEffect(() => {
    const ctx = canvas.current?.getContext?.('2d');
    const background = sheet(plan.cols * TILE, plan.rows * TILE);
    if (background) paintRoom(background.ctx, plan, (family) => look(family, family).shirt);
    const frame = (now: number) => {
      const { plan, members } = live.current;
      if (ctx) {
        ctx.clearRect(0, 0, plan.cols * TILE, plan.rows * TILE);
        if (background) ctx.drawImage(background.canvas, 0, 0);
        drawRoom(ctx, plan, members, cast, now);
      }
      for (const actor of cast.values()) {
        const marker = markers.current.get(actor.id);
        if (marker) marker.style.transform = place(actor.x, actor.y);
      }
    };
    // A plan redrawn under the cast moves its furniture: whoever was here is put back in place.
    const here = new Set(cast.keys());
    const first = here.size === 0;
    syncActors(cast, live.current.wants, plan, performance.now());
    if (first || castPlan !== plan)
      placeActors(cast, plan, Math.random, (id) => first || here.has(id));
    castPlan = plan;
    if (reduced) {
      settleActors(cast, plan, Math.random);
      frame(0);
      return;
    }
    let last = performance.now();
    let request = requestAnimationFrame(function tick(now) {
      syncActors(cast, live.current.wants, live.current.plan, now);
      stepActors(cast, live.current.plan, Math.min(0.1, (now - last) / 1000), now, Math.random);
      last = now;
      frame(now);
      request = requestAnimationFrame(tick);
    });
    return () => cancelAnimationFrame(request);
  }, [plan, reduced, reduced && shown]);

  return (
    <div
      data-testid="office-building"
      className="relative shrink-0 overflow-hidden rounded-md border"
      style={{ width: plan.cols * TILE * ZOOM, height: plan.rows * TILE * ZOOM }}
    >
      <canvas
        ref={canvas}
        aria-hidden
        width={plan.cols * TILE}
        height={plan.rows * TILE}
        className="absolute inset-0 size-full [image-rendering:pixelated]"
      />
      {plan.rooms.map((area) => {
        const count = members.filter((member) => member.room === area.key).length;
        return (
          <h3
            key={area.key}
            data-testid="office-room"
            data-room={area.key}
            aria-label={`${area.label} room`}
            className="absolute rounded-sm bg-black/75 px-1.5 font-mono font-semibold text-[10px] text-white uppercase leading-4 tracking-wide"
            style={{ left: (area.col + 1) * TILE * ZOOM + 4, top: area.row * TILE * ZOOM + 2 }}
          >
            {area.label}
            <span className="ml-1.5 font-normal text-white/60">{count}</span>
          </h3>
        );
      })}
      {members.map((member) => {
        const { row, pose } = member;
        const tone = stateTone(pose.state);
        const title = sessionTitle(row);
        const at = (!member.visitor && pose.does !== 'stroll' && plan.seats[row.id]) || plan.entry;
        const subagents = row.managed && !member.visitor ? (row.subagents ?? []) : [];
        const context = row.managed && !member.visitor ? row.context : undefined;
        return (
          <button
            key={member.key}
            ref={(element) => {
              if (element) markers.current.set(member.key, element);
              else markers.current.delete(member.key);
            }}
            type="button"
            data-testid={member.visitor ? 'office-visitor' : 'office-agent'}
            data-session={row.id}
            data-state={pose.state}
            data-emote={pose.emote}
            aria-label={`Open session ${title}: ${pose.says}${member.visitor ? `, visiting from ${member.visitor}` : ''}`}
            className="absolute top-0 left-0 rounded-sm outline-none hover:z-10 focus-visible:z-10 focus-visible:ring-2 focus-visible:ring-ring"
            style={{
              width: FRAME.w * ZOOM,
              height: FRAME.h * ZOOM,
              transform: place(at.col * TILE, at.row * TILE),
            }}
            onClick={() => props.onOpen(row.id)}
            onMouseEnter={() => props.onPeek(row.id)}
            onMouseLeave={() => props.onPeek(undefined)}
            onFocus={() => props.onPeek(row.id)}
            onBlur={() => props.onPeek(undefined)}
          >
            <span
              className={cn(
                'office-bubble office-emote absolute top-2 left-full -ml-1.5 flex size-[18px] items-center justify-center border-2 border-current bg-card',
                tone.ink,
                member.visitor && 'opacity-60',
              )}
            >
              <PixelSprite map={EMOTES[pose.emote]} palette={{ x: 'currentColor' }} scale={2} />
            </span>
            <span className="absolute top-full left-1/2 flex w-[5.5rem] -translate-x-1/2 flex-col items-center gap-px">
              <span
                className="flex max-w-full items-center gap-1 rounded-sm bg-black/70 px-1 text-[10px] text-white leading-4"
                style={
                  member.lead || member.child
                    ? {
                        boxShadow: `inset 3px 0 0 ${look(row.id, member.family).shirt}`,
                        paddingLeft: 7,
                      }
                    : undefined
                }
              >
                {row.managed && row.unread && (
                  <span
                    role="img"
                    aria-label="Unread"
                    className="size-1.5 shrink-0 rounded-full bg-state-unread"
                  />
                )}
                {member.lead && (
                  <Crown aria-label="Parent" className="size-2.5 shrink-0 text-yellow-300" />
                )}
                <span className="truncate">
                  {member.child && '↳ '}
                  {title}
                </span>
                {subagents.length > 0 && (
                  <span
                    data-testid="office-subagents"
                    title={`${subagents.length} subagent${subagents.length === 1 ? '' : 's'}: ${subagents.map((s) => s.type ?? 'agent').join(', ')}`}
                    className="shrink-0 text-white/70"
                  >
                    +{subagents.length}
                  </span>
                )}
              </span>
              {(member.visitor || member.reportsTo) && (
                <span className="max-w-full truncate rounded-sm bg-black/50 px-1 text-[9px] text-white/80 leading-3">
                  {member.visitor ? `from ${member.visitor}` : `↳ ${member.reportsTo}`}
                </span>
              )}
              {context && (
                <Progress
                  value={contextPercent(context.used)}
                  aria-label={`Context used: ${contextPercent(context.used)}%`}
                  className={cn('h-0.5 w-8 bg-black/60', toneIndicator(contextTone(context.used)))}
                />
              )}
            </span>
          </button>
        );
      })}
    </div>
  );
}

/** Where a marker sits for a character whose tile's corner is at (`x`, `y`): over its whole frame. */
const place = (x: number, y: number) =>
  `translate(${Math.round(x) * ZOOM}px, ${(Math.round(y) + TILE - FRAME.h) * ZOOM}px)`;
