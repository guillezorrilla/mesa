import { expect, test } from 'vitest';
import { foreignRow, managedRow, PROJECTS } from '@/lib/testing';
import { officeRooms, pods } from './officeLayout';
import { officePose } from './officePose';

const at = (minute: number) => `2026-09-25T12:${String(minute).padStart(2, '0')}:00.000Z`;
const state = (name: 'idle' | 'waiting-question' | 'waiting-permission' | 'failed') => ({
  lastState: { state: name, confidence: 0.95, at: at(0), source: 'hook' as const },
});

test('a room per project in registry order, a family in one pod, a parent elsewhere named, a visitor per additional project', () => {
  const parent = managedRow('aaaaaaaa', {
    name: 'Chart shoals',
    startedAt: at(1),
    children: ['bbbbbbbb'],
  });
  const child = managedRow('bbbbbbbb', { parentNow: 'aaaaaaaa', startedAt: at(3), depth: 1 });
  const loner = managedRow('cccccccc', { startedAt: at(2) });
  const away = managedRow('dddddddd', { project: 'tide', parentNow: 'aaaaaaaa', startedAt: at(4) });
  const both = managedRow('eeeeeeee', {
    project: 'tide',
    startedAt: at(5),
    additional: [{ project: 'lantern-cove', worktree: { path: '/w/lantern-cove/f', branch: 'f' } }],
  });
  const setup = managedRow('ffffffff', {
    kind: 'terminal',
    agent: 'terminal',
    name: 'Setup',
    parent: 'aaaaaaaa',
  });
  // Attention order, as the board sends it: seats ignore it.
  const rooms = officeRooms([both, away, loner, child, parent, setup, foreignRow], PROJECTS);
  expect(rooms.map((room) => room.key)).toEqual(['lantern-cove', 'tide', '']);
  const [cove, tide] = rooms;
  expect(cove?.desks.map((desk) => [desk.row.id, desk.pod, desk.family])).toEqual([
    ['aaaaaaaa', 'aaaaaaaa', 'aaaaaaaa'],
    ['bbbbbbbb', 'aaaaaaaa', 'aaaaaaaa'],
    ['cccccccc', 'cccccccc', 'cccccccc'],
  ]);
  expect(pods(cove?.desks ?? []).map((pod) => pod.length)).toEqual([2, 1]);
  expect(cove?.visitors.map((visitor) => [visitor.row.id, visitor.home])).toEqual([
    ['eeeeeeee', 'tide'],
  ]);
  expect(tide?.desks.map((desk) => [desk.row.id, desk.family, desk.reportsTo])).toEqual([
    ['dddddddd', 'aaaaaaaa', 'Chart shoals'],
    ['eeeeeeee', 'eeeeeeee', undefined],
  ]);
});

test('a pose follows the state, and a working one the last tool', () => {
  const pose = (extra: Parameters<typeof managedRow>[1]) => {
    const { emote, does, says } = officePose(managedRow('aaaaaaaa', extra));
    return [emote, does, says];
  };
  expect(pose({})).toEqual(['dots', 'sit', 'thinking']);
  expect(pose({ activity: { kind: 'writing', tool: 'Edit', at: at(1) } })).toEqual([
    'pencil',
    'type',
    'writing (Edit)',
  ]);
  expect(pose(state('waiting-permission'))).toEqual(['alert', 'wave', 'needs your permission']);
  expect(pose({ ...state('idle'), asking: true })).toEqual([
    'question',
    'wave',
    'asking its parent',
  ]);
  expect(pose(state('idle'))).toEqual(['sleep', 'stroll', 'idle']);
  expect(pose({ ...state('idle'), unread: true })).toEqual(['check', 'turn', 'finished its turn']);
  expect(pose(state('failed'))).toEqual(['cross', 'turn', 'failed']);
});
