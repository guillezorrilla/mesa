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
- After `shadcn add`, check the new file's imports and `package.json`: shadcn's resolver misreads the `@/` alias here, writes `import { cn } from "cn"`, and installs an unrelated `cn` package; point the import at `@/lib/utils` and `pnpm remove cn`.
- shadcn's components are Mesa's code now: an upstream fix is pulled in by re-adding the component, reviewing the diff.

## Amendment 2026-09-26: confirmations and alerts are two toast tones (#129)

One channel made every confirmation ("Stopped session a1b2") look like a failure: it wore the warm wait colour, stayed until dismissed, and a second identical one (sending "hello" twice) showed nothing. The owner chose two tones (#129, option b):

- `toast(text, tone)` takes `confirmation` or `alert` (the default, for a failed command). An action returns its message with its tone: `said()` is a confirmation, or an alert when the command's data carries a warning (no receipt, a skill not synced), and `warned()` is a command's own warning as an alert.
- A confirmation is neutral (a muted check icon), shows every time, and goes by itself after `CONFIRMATION_MS` (4 s).
- An alert keeps the first decision: warm (the wait colour's warning icon), shown once however often it comes, and it stays until dismissed.
- Each toast carries `data-tone`, so tests read the tone as they read the text.

Evidence: `apps/desktop/src/App.test.tsx` "a confirmation is neutral, shows every time, and goes by itself" and "a failure, or a confirmation with a warning, is an alert: warm, once, and it stays", with vitest's fake timers; letting a confirmation dedupe or stay, or an alert go by itself, fails one of them.

## Amendment 2026-09-26: one dialog frame, shadcn's native select, and the parts as they are now (#131, #149)

- The project picker is shadcn's `NativeSelect` (`components/ui/native-select.tsx`), still a native `<select>`, so the form reads it and a project whose folder is gone is a disabled option. It replaces the Decision's hand-copied Input classes. It was added with `pnpm dlx shadcn@latest add native-select`, and the `cn` gotcha under Consequences applied: the registry item imported `cn` from an npm package of that name, so the import points at `@/lib/utils` and the dependency is gone. Its wrapper is `w-full`, as Input is.
- The Board's four dialogs (New session, Hand off, Rename, Remove) share one frame, `components/ActionDialog.tsx`: a modal with a title, a description, the fields, and Cancel beside a submit that is disabled while acting. `BoardScreen` keeps one open-dialog state.
- The Decision's lists, as the code has them now. `components/ui/`: Alert, Badge, Button, Card, Checkbox, Dialog, Input, Label, NativeSelect, Progress, RadioGroup, Table, Textarea. `components/`: ActionDialog, ContextBar, LogBox, PageHeader, ProfileSummary, StateBadge, Terminal, Toast. `screens/board/`: rows, the row and its menu, the tree toggle, received prompts, the New session, Hand off, Rename, and Remove dialogs, terminal panels, and the `useBoard` look loop.
- What the app shares with the CLI at run time comes from core's pure entry, `@mesa/core/browser` (ADR-0008 amendment): how a row's label, branch, and numbers read, and which states are final or waiting. The app keeps no copy of those rules.
