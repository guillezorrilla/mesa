import { useEffect, useState } from 'react';

/** When `data` last arrived (ms since the epoch), for a "Checked <age>" line; undefined before. */
export function useReadAt(data: unknown) {
  const [readAt, setReadAt] = useState<number>();
  useEffect(() => {
    if (data) setReadAt(Date.now());
  }, [data]);
  return readAt;
}
