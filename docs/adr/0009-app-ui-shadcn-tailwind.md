# ADR-0009: The app's screens are built from shadcn/ui components on Tailwind, with lucide icons

Status: accepted
Date: 2026-09-26

## Context

The app's screens (Board, Projects, Receipts, Doctor, Help) were raw `<button>`, `<table>`, and `<dialog>` elements styled by one global stylesheet: nothing was reusable, and every screen restyled by hand. The owner asked for a component library (shadcn/ui), Tailwind alongside it, an icon library, and reusable components (#99). The remaining P2b screens (#71, #72, #75, #76) build on what is chosen here.

shadcn/ui is not a dependency but source copied into the repo (`apps/desktop/src/components/ui/`), over Radix primitives and Tailwind, so the components are Mesa's to read and change; lucide-react is its default icon set.

## Decision

- Tailwind CSS v4 through `@tailwindcss/vite`; `src/style.css` holds only Tailwind's entry, the fonts, and the theme tokens. Versions at decision time: tailwindcss 4.3.3, @tailwindcss/vite 4.3.3, shadcn CLI 4.21.0 (new-york style), radix-ui 1.6.7, lucide-react 1.48.0, class-variance-authority 0.7.1, clsx 2.1.1, tailwind-merge 3.7.0, tw-animate-css 1.4.0.
- Components: `components/ui/` holds shadcn's primitives (Button, Input, Textarea, Table, Badge, Dialog, Card, Label, RadioGroup, Alert), added with `pnpm dlx shadcn@latest add`; `components/` holds Mesa's shared ones (StateBadge, PageHeader, Toast, Terminal, LogBox, ProfileSummary); a screen with several parts gets a folder (`screens/board/`: rows, the row, the tree toggle, received prompts, the New session dialog, terminal panels, and the `useBoard` look loop).
- The theme is shadcn's CSS variables over a cool neutral base, plus one `--state-*` token per Session state; the wait states are the only warm colour, so a session that needs a person stands out. Light and dark follow the system (`prefers-color-scheme`); there is no switch.
- Type is IBM Plex Sans with IBM Plex Mono for ids, times, and output, bundled through @fontsource (Latin only), since the app runs offline.
- Toasts are Mesa's own over shadcn's Alert, not Sonner: they dedupe repeats and stay until dismissed, and tests read them synchronously.
- The project picker stays a native `<select>` styled as shadcn's Input, so the form reads it and a project whose folder is gone is a disabled option.
- Tests keep their `data-testid`s; `renderWithMesa`'s `byTestId` searches the whole document, since Radix dialogs render in a portal.

## Evidence

`pnpm verify` green with every `App.test.tsx` case kept; the only assertion changes are those the components force (a Radix dialog's `data-state`, the RadioGroup's `role="radio"`) or the move from inline styles and class names to data attributes (`data-state` on StateBadge, `data-health` on the doctor verdict, `data-managed` on a row). A headless Chrome render of the built bundle showed the layout, the fonts, and the dark theme.

## Consequences

- A new screen or element uses the shared components; a missing primitive is added with `pnpm dlx shadcn@latest add <name>` into `components/ui/`, and a Mesa-specific one goes in `components/`.
- Colours come from the theme tokens, never literal values in a component.
- shadcn's components are Mesa's code now: an upstream fix is pulled in by re-adding the component, reviewing the diff.
