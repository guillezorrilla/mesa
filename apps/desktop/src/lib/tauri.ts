import { invoke } from '@tauri-apps/api/core';
import type { Bridge } from './client';

/** The real bridge: the Rust `run_mesa` command, which spawns the mesa CLI. */
export const tauriBridge: Bridge = (args) => invoke('run_mesa', { args });
