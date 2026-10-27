import { useEffect, useRef } from 'react';
import { cn } from '@/lib/utils';
import { DiffFileRow } from './DiffFileRow';
import { DiffFileTree } from './DiffFileTree';
import type { DiffFile } from './diffFiles';
import type { DiffTreeNode } from './diffTree';

/**
 * The changed files, as a folder tree (DiffFileTree) or flat (DiffFileRow, each name over its
 * folder), in one scrolling list whose focus follows the open file.
 */
export function DiffFileList(props: {
  files: DiffFile[];
  /** The folder tree to show (diffTree); none for the flat list. */
  tree?: DiffTreeNode[];
  open: string;
  onOpen: (path: string) => void;
  className?: string;
}) {
  const list = useRef<HTMLUListElement>(null);
  // Focus in the list follows the open file, so j and k never leave the ring on the last one.
  // biome-ignore lint/correctness/useExhaustiveDependencies: a newly opened file moves the focus.
  useEffect(() => {
    if (list.current?.contains(document.activeElement))
      list.current.querySelector<HTMLElement>('[aria-current="true"]')?.focus();
  }, [props.open]);
  return (
    <ul
      ref={list}
      aria-label="Changed files"
      className={cn('min-h-0 shrink-0 overflow-y-auto border-r py-1', props.className)}
    >
      {props.tree ? (
        <DiffFileTree tree={props.tree} open={props.open} onOpen={props.onOpen} />
      ) : (
        props.files.map((file) => (
          <li key={file.path}>
            <DiffFileRow
              file={file}
              current={file.path === props.open}
              withFolder
              onOpen={props.onOpen}
            />
          </li>
        ))
      )}
    </ul>
  );
}
