---
name: patreon-dl
description: Download Patreon posts, collections, shop products, images, videos, and attachments the user already has access to, using the patreon-dl CLI. Use when the user asks Koda to save a Patreon URL, a creator's posts, a collection, or pledged campaign media.
---

# patreon-dl

Koda runs this herself. Do not tell the user to copy cookies from DevTools. Use the `terminal` tool.

## Binary and files

- CLI: `"$HOME/.local/bin/patreon-dl"` — wrapper that starts **Koda Browser** (her Chromium profile at `~/.unsloth/studio/koda-browser`, including Cookie-Editor) if CDP is down, reads Patreon cookies over loopback CDP, writes them into the config, then execs the npm CLI. Do not pass `-c` / `--cookie`. Do not read Zen or any other browser.
- Config: `~/.config/patreon-dl/patreon.conf` (mode 600). Never print it.
- Output: `~/PatreonDownloads` unless the user names another directory.
- FFmpeg is required for many videos. Deno is optional (safer YouTube embeds).

## Run a download

```bash
"$HOME/.local/bin/patreon-dl" --no-prompt -C "$HOME/.config/patreon-dl/patreon.conf" -o "$HOME/PatreonDownloads" "<url>"
```

Set `timeout` to at least 1800 seconds. Use `--no-prompt` always so the process does not wait on stdin.

Supported URL shapes: creator `/posts`, `/shop`, a single `/posts/<id>`, `/collection/<id>`, custom creator domains, or a text file of URLs.

If the user names a creator vanity without a URL, list first:

```bash
"$HOME/.local/bin/patreon-dl" --list-posts <vanity>
```

Then download `https://www.patreon.com/<vanity>/posts`.

## Login

Patron-only posts use the session in **Koda Browser**, not the user's everyday Zen window. If the wrapper exits with "No Patreon session in Koda Browser":

1. Tell the user to sign into patreon.com in the Chromium window Koda opened (Cookie-Editor is already on that profile).
2. Retry the same command.
3. Do not ask them to paste a cookie into chat or into the conf file.

## After it finishes

Report the output directory and a short count of what appeared (campaign folder, posts, media). Do not start `patreon-dl-server` unless they ask to browse locally.
