# Mesa for iPhone

The phone app (ADR-0027): it pairs with a Mac's Mesa profile by QR (ADR-0014's 2026-11-11 amendment), and later pings you when a session needs you, shows what it said, and sends your reply. Expo on the New Architecture with Hermes, `expo-router`, the React Compiler, and Uniwind (Tailwind v4) over Mesa's design tokens.

Expo changes with every SDK. Before touching an Expo, EAS or React Native API, read the docs for the SDK in `package.json` (`https://docs.expo.dev/versions/v<major>.0.0/`), not memory.

## Run it

```sh
pnpm --filter @mesa/core build        # the app bundles @mesa/core/phone from core's build
pnpm -C apps/mobile ios               # expo run:ios: a native build on the simulator, then Metro
```

`ios/` is generated (Continuous Native Generation) and never committed: native settings live in `app.config.ts` and config plugins. Add a dependency with `pnpm -C apps/mobile exec expo install <package>`, which picks the version this SDK supports. On a Mac without a UTF-8 locale, CocoaPods needs `LANG=en_US.UTF-8`.

To pair with a Mac, run a local broker (`pnpm -C apps/broker exec wrangler dev`) and `MESA_BROKER_URL=http://localhost:8787 mesa phone pair`, then scan the QR, or paste its `mesa://pair?...` link in the app.

## Code shape

- `src/app/` holds routes only; each imports one screen from a feature.
- `src/features/<domain>/` holds that domain's screens, its one hook or provider per piece of state, and pure functions (with vitest tests beside them) for text and logic.
- `src/components/ui/` holds the primitives from `react-native-reusables`' Uniwind registry, owned here; `src/components/` holds Mesa's domain-free composites built from them.
- React 19 as written: data through `use()` under Suspense, changes through actions (`useActionState`), effects only for what is outside React. Biome refuses `useMemo`, `useCallback`, `memo` and `forwardRef` here, and an import of the lucide package root, which would bundle every icon: import each as `lucide-react-native/icons/<name>`.
- `src/global.css` copies the desktop's tokens; `src/tokens.test.ts` fails when they drift.

## Release

Releases run on GitHub Actions (`.github/workflows/mobile.yml`), which calls EAS. Every push to `main` touching the app, its protocol in core or the lockfile computes the iOS native fingerprint (`pnpm -C apps/mobile exec expo-updates fingerprint:generate --platform ios`) and looks for a production build with it on EAS:

- **A build has this fingerprint** (only JavaScript, styles or assets changed): an EAS Update goes to the `production` branch, and the app picks it up on its next launch or the one after. About shows the running update's id.
- **None has it** (a native dependency, a config plugin, `app.config.ts`, the Expo SDK): EAS Build makes a production build (the build number counted on EAS), and EAS Submit sends it to TestFlight.

On a pull request, `mobile-pr.yml` compares the fingerprint at the head and at the base and comments when they differ, since merging will then make a TestFlight build. GitHub Actions' `verify` still lints, typechecks and tests the app and runs `expo-doctor`. The marketing version in `app.config.ts` changes by hand, in a pull request. Credentials (the App Store Connect key, the distribution certificate, the profiles) live in EAS; GitHub holds only `EXPO_TOKEN`, read by `mobile.yml` alone. `gh workflow run mobile.yml --ref main` runs a deploy by hand. CI runs eas-cli as `pnpm dlx eas-cli@<exact version>`; it is not a dependency of the app, as `expo-doctor` refuses one.
