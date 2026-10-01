# Mesa artwork

`icon.png` is the original transparent Mesa mark. The generated `128x128.png` supplies the in-app header logo.

`macos-icon.png` is the mark inside a rounded charcoal tile, used for the macOS Dock icon. Both packaged macOS apps and Tauri development runs use `icon.icns`.

Regenerate only the macOS icon from the repository root:

```sh
mesa_icon_output="$(mktemp -d)"
pnpm --dir apps/desktop exec tauri icon src-tauri/icons/macos-icon.png --output "$mesa_icon_output"
cp "$mesa_icon_output/icon.icns" apps/desktop/src-tauri/icons/icon.icns
rm -rf "$mesa_icon_output"
```
