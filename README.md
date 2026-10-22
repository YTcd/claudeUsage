# Claude Usage

Shows your Claude Code **5-hour** and **7-day** usage in the VS Code status bar,
with reset countdowns.

## How it gets data

- **statusLine bridge (primary):** while any Claude Code session is running, it
  pushes usage into `~/.claude/cc-usage.json`, which this extension reads
  instantly — free, no rate limits.
- **OAuth poll (optional top-up):** with a token set, it polls the usage API so
  numbers stay reasonably fresh even when no session is open.

## Setup (per machine)

1. **Install** the `.vsix`: VS Code → Extensions → `…` menu → **Install from VSIX…**
2. **Set up the bridge:** Command Palette (`Cmd/Ctrl+Shift+P`) →
   **“Claude Usage: Set up statusLine bridge”**. This writes
   `~/.claude/cc-usage-bridge.sh` and points your `~/.claude/settings.json`
   `statusLine` at it. Start or reload a Claude Code session afterward.
3. *(Optional)* **Enable session-independent polling:** run
   `claude setup-token`, then paste the token into the setting
   **`claudeUsage.oauthToken`**.

## Settings

| Setting | Default | Notes |
|---|---|---|
| `claudeUsage.oauthToken` | `""` | Token from `claude setup-token`. Stored in plaintext in your settings. Leave empty to use only the bridge. |
| `claudeUsage.pollIntervalSeconds` | `1800` | Poll cadence when a token is set. The endpoint is aggressively rate-limited — keep it high. `0` = manual only (click the status-bar item). |

## Notes

- The status bar shows a warning only when data is genuinely untrusted (older
  than 2h, or past a reset boundary) — recent idle data is shown normally.
- The usage API is undocumented and may change; the bridge keeps working
  regardless.
