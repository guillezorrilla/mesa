# mesa command reference

Every mesa command, generated from the CLI's own command table. In a usage line `<x>` is required and `[x]` is optional; every argument is a string.

With `--json`, a command prints one envelope on stdout: `{"ok":true,"data":...}`, or `{"ok":false,"error":{"code":...,"message":...}}`. A nonzero exit code means it failed, or found a problem it reports in `data` (`mesa doctor`, `mesa vault status`).

Global flags go before or after the command:

- `--profile <string>`: Select the profile (default: MESA_PROFILE, else "default")
- `--json`: Print the result envelope as JSON on stdout
- `--help`: Show help
- `--version`: Print the version

## greet

### `mesa greet <who> [title] [--loud]`

Greet someone (a fake command)

- `--loud`: Shout

Example: `mesa greet ada --loud`

### `mesa greet at <who> --place <string> [--wave]`

Greet someone somewhere

- `--place <string>` (required): Where to greet
- `--wave`: Wave too

Example: `mesa greet at ada --place hall --wave`
