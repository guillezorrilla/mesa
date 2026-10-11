/** `base`, or `base 2`, `base 3`... until no view has the name. */
export const freeName = (base: string, taken: readonly string[]) => {
  const used = new Set(taken.map((n) => n.toLowerCase()));
  for (let n = 1; ; n++) {
    const name = n === 1 ? base : `${base} ${n}`;
    if (!used.has(name.toLowerCase())) return name;
  }
};
