/** Profile-qualified navigation to a saved session; RFC 3986 encodes each component. */
export function sessionUri(id: string, profile: string): string {
  const component = (value: string) =>
    encodeURIComponent(value).replace(
      /[!'()*]/g,
      (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
    );
  return `mesa://session/${component(id)}?profile=${component(profile)}`;
}
