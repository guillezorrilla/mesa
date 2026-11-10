import type { Command } from '../../command.js';
import {
  reviewNotes,
  reviewNotesAdd,
  reviewNotesEdit,
  reviewNotesRemove,
  reviewNotesSend,
} from './notes.js';
import {
  reviewChangePreview,
  reviewChangeSend,
  reviewChanges,
  reviewPreview,
  reviewResponses,
  reviewSend,
} from './replies.js';

// Every `mesa review` subcommand, in help order.
export const REVIEW_COMMANDS: Command[] = [
  reviewResponses,
  reviewPreview,
  reviewSend,
  reviewChanges,
  reviewChangePreview,
  reviewChangeSend,
  reviewNotes,
  reviewNotesAdd,
  reviewNotesEdit,
  reviewNotesRemove,
  reviewNotesSend,
];
