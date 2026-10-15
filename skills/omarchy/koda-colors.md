# Koda addition: colors.toml key reference

This file is Koda-owned (not synced from Omarchy). It carries the exact
`colors.toml` keys so a model can answer theme questions precisely instead of
inventing a format. Values shown are Catppuccin Mocha's, from
`/usr/share/omarchy/themes/catppuccin/colors.toml`.

A theme's `colors.toml` uses **semantic top-level keys** — no `[colors]` table,
no `color0`–`color15`:

```toml
mode = "dark"              # "dark" or "light"

accent = "#89b4fa"         # the single accent color
selection = "#45475a"      # selected-text background
muted = "#585b70"          # dimmed / de-emphasized text

background = "#1e1e2e"     # main background
dark_background = "#161622"
darker_background = "#101019"
lighter_background = "#313244"

foreground = "#cdd6f4"     # main text
dark_foreground = "#6c7086"
light_foreground = "#bac2de"
bright_foreground = "#cdd6f4"

red = "#f38ba8"
yellow = "#f9e2af"
orange = "#f6b6ab"
green = "#a6e3a1"
cyan = "#94e2d5"
blue = "#89b4fa"
magenta = "#f5c2e7"
brown = "#7b5b55"

bright_red = "#f38ba8"
bright_yellow = "#f9e2af"
bright_green = "#a6e3a1"
bright_cyan = "#94e2d5"
bright_blue = "#89b4fa"
bright_magenta = "#f5c2e7"
```

There is no `border`, `cursor`, `font`, `wallpaper`, or `color0`–`color15` key.
Fonts are managed with `omarchy font set`; wallpapers live in the theme's
`backgrounds/` directory.
