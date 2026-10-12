/**
 * `fn` over each of `items`, at most `limit` at once, the results in `items`' order: a fan-out of
 * requests that stays inside an API's rate limit.
 */
export async function mapLimit<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const at = next++;
      results[at] = await fn(items[at] as T);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}
