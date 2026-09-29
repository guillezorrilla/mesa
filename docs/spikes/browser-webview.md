# Session browser qualification (#271)

Run on 2026-09-28 with Tauri 2.11 and macOS WKWebView in a disposable `p4-image-check` Mesa profile. The page server and pages were local invented fixtures under `/private/tmp/mesa-271-live.Hhu1co`; a live Claude Code 2.1.284 session remained in the adjacent terminal. No user profile or vault data was used.

The native child webview rendered beside the terminal. Address navigation, a page link, Back, Forward, Reload, and DOM inspection worked. A click picker returned the selected `Second Otter` heading's selector and visible text; navigating away cleared it. An attempted `file:///etc/passwd` address was rejected. The remote page saw Tauri internals but its attempt to call `run_mesa` returned `Command run_mesa not allowed by ACL` after the capability was scoped to the `main` webview. The app controls are on that trusted webview; page content is shown as untrusted text in the annotation preview.

This qualifies local HTTP pages in the packaged Mac app. It does not establish behavior on arbitrary remote sites, embedded frames, login pages, downloads, or browser extensions. The annotation delivery and stale-element checks are verified separately in the #271 feature tests and native provider run.
