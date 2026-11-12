import { useState } from 'react';
import { useMacRead } from '../mac/useMacRead';
import { useFileSearch } from './useFileSearch';

/** The Files screen: the worktree's tree, the folder open in it, and a search of it. */
export function useFiles(id: string) {
  const { answer: tree } = useMacRead({ method: 'files', id });
  const [folder, open] = useState('');
  return { tree, folder, open, ...useFileSearch(id) };
}
