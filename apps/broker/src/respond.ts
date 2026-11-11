/** A JSON answer the broker never lets a cache keep; no body gives an empty one (a 204). */
export const json = (status: number, body?: unknown) =>
  body === undefined
    ? new Response(null, { status })
    : new Response(JSON.stringify(body), {
        status,
        headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
      });
