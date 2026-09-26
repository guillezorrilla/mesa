# mesa command reference

Every mesa command, generated from the CLI's own command table. In a usage line `<x>` is required and `[x]` is optional; every argument is a string.

With `--json`, a command prints one envelope on stdout: `{"ok":true,"data":...}`, or `{"ok":false,"error":{"code":...,"message":...}}`. A nonzero exit code means it failed, or that it found a problem it reports in `data`.

Global flags go before or after the command:

- `--json`: Print JSON

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

## warn

### `mesa warn`

Succeed with a problem

Example: `mesa warn`
