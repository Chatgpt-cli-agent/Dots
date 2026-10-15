# In-Game Mod Testing & Automation on Linux (Hyprland / OmArchy)

Guide for launching The Sims 4 via the EA App or Steam on Arch Linux / Hyprland, deploying mods, testing via window automation, capturing screenshots, and reading logs.

## 1. Deploying Mods Before Launch
Mods directory on this system:
`~/Games/EA-Sims4-Documents/Electronic Arts/The Sims 4/Mods`

- For package mods: copy `.package` files into `~/Games/EA-Sims4-Documents/Electronic Arts/The Sims 4/Mods/`
- For script mods: copy `.ts4script` directly into `Mods/` (max 1 subfolder deep per game limits).

## 2. Launching The Sims 4

### Option A: Via EA App (User Preferred)
The standalone EA App is installed via Proton and has a dedicated launcher script on PATH:
```bash
# Launch the EA App in background
launch-ea-app &
# Or explicit path:
/home/windenburg/.local/bin/launch-ea-app &
```
To check if EA App is running:
```bash
pgrep -f "EADesktop.exe"
hyprctl clients | grep -i "EADesktop"
```

### Option B: Via Steam
```bash
# Launch via Steam in the background
steam steam://rungameid/1222670 &
```

## 3. Window Detection & Focus (Hyprland)
Check if The Sims 4 game window is active:
```bash
# Check if game process is alive
pgrep -f "TS4_x64.exe"

# List clients matching Sims 4
hyprctl clients | grep -Ei "steam_app_1222670|The Sims 4|TS4_x64"
```
Focus the game window:
```bash
# Works whether launched via EA App or Steam
hyprctl dispatch focuswindow "title:^(The Sims™ 4|The Sims 4)$"
# Or by window class regex:
hyprctl dispatch focuswindow "class:^(.*(1222670|TS4_x64|The Sims 4).*)$"
```

## 4. Sending Keystrokes & Interacting (Wayland `wtype`)
On Wayland, use `wtype` (installed at `/usr/bin/wtype`):
```bash
# Press Enter (to skip intro / click continue)
wtype -k Return

# Open cheat console (Ctrl+Shift+C)
wtype -M ctrl -M shift -k c -m ctrl -m shift

# Type cheat or command
wtype "testingcheats true"
wtype -k Return

# Close dialog / menu
wtype -k Escape
```

## 5. Taking In-Game Screenshots (Wayland `grim`)
Do NOT use `scrot` or `xdotool` (they fail on Wayland). Use `grim` or `omarchy`:
```bash
# Fullscreen screenshot straight to a file
grim /tmp/sims4_test_screenshot.png

# Or via omarchy
omarchy capture screenshot fullscreen save
```

## 6. Inspecting Mod Logs and Errors
The Sims 4 outputs python tracebacks and mod loading errors in real time:
- Python exceptions & mod crashes:
  `~/Games/EA-Sims4-Documents/Electronic Arts/The Sims 4/lastException.txt`
- Game crash logs:
  `~/Games/EA-Sims4-Documents/Electronic Arts/The Sims 4/lastCrash.txt`
- Config & startup:
  `~/Games/EA-Sims4-Documents/Electronic Arts/The Sims 4/Config.log`

Read these files after testing to verify the mod loaded cleanly with zero exceptions.

## 7. Gracefully Closing The Sims 4
```bash
# Gracefully close the game window in Hyprland
hyprctl dispatch closewindow "title:^(The Sims™ 4|The Sims 4)$"

# If the game is stuck or needs termination
pkill -f "TS4_x64.exe"

# To close the EA App when done testing
pkill -f "EADesktop.exe"
```
