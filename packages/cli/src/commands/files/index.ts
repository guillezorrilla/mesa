import type { Command } from '../../command.js';
import { filesCreate, filesDelete, filesRename, filesWrite } from './edit.js';
import { filesLink, filesSearch, filesTree } from './find.js';
import { filesOpen, filesRead } from './view.js';

// Every `mesa files` subcommand, in help order.
export const FILES_COMMANDS: Command[] = [
  filesCreate,
  filesDelete,
  filesLink,
  filesOpen,
  filesRead,
  filesRename,
  filesSearch,
  filesTree,
  filesWrite,
];
