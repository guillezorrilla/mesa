/** The quiet link under a tracker's page that picks another tracker. */
export function ElsewhereLink(props: { onClick: () => void }) {
  return (
    <button
      type="button"
      className="text-sm text-muted-foreground underline underline-offset-3 hover:text-foreground"
      onClick={props.onClick}
    >
      Track work somewhere else
    </button>
  );
}
