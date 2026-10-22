const vscode = require("vscode");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { renderText, renderTooltip, normalizeBridge, normalizeOauth } = require("./render");
const { fetchUsage } = require("./oauth");

const CLAUDE_DIR = path.join(os.homedir(), ".claude");
const USAGE_FILE = path.join(CLAUDE_DIR, "cc-usage.json");
const BRIDGE_PATH = path.join(CLAUDE_DIR, "cc-usage-bridge.sh");
const SETTINGS_PATH = path.join(CLAUDE_DIR, "settings.json");

// The statusLine bridge: captures the JSON Claude Code pushes and writes it to
// USAGE_FILE for the extension to read. Degrades gracefully without jq.
const BRIDGE_SCRIPT = `#!/usr/bin/env bash
# Written by the Claude Usage VS Code extension.
input=$(cat)
printf '%s' "$input" > "$HOME/.claude/cc-usage.json"
if command -v jq >/dev/null 2>&1; then
  five=$(printf '%s' "$input" | jq -r '.rate_limits.five_hour.used_percentage // "?"')
  seven=$(printf '%s' "$input" | jq -r '.rate_limits.seven_day.used_percentage // "?"')
  echo "5h:\${five}% 7d:\${seven}%"
else
  echo "claude-usage ✓"
fi
`;

let item, out, watcher, uiTimer, pollTimer;
let bridgeRec = null; // from the statusLine bridge file
let oauthRec = null;  // from the OAuth usage poll
let backoffMs = 0;    // grows on 429, resets on success

function cfg() {
  return vscode.workspace.getConfiguration("claudeUsage");
}

// Pick the most recently obtained record across both sources.
function freshest() {
  const recs = [bridgeRec, oauthRec].filter(Boolean);
  if (!recs.length) return null;
  return recs.reduce((a, b) => (b.ts > a.ts ? b : a));
}

function render() {
  const now = Date.now();
  const rec = freshest();
  item.text = renderText(rec, now);
  item.tooltip = new vscode.MarkdownString(
    rec ? renderTooltip(rec, now) : "No usage data yet.\nSet `claudeUsage.oauthToken` or start a Claude Code session."
  );
  item.show();
}

// Re-read the bridge file; keep the last good record on any read/parse error.
function readBridge() {
  try {
    const stat = fs.statSync(USAGE_FILE);
    const data = JSON.parse(fs.readFileSync(USAGE_FILE, "utf8"));
    bridgeRec = normalizeBridge(data, stat.mtimeMs) || bridgeRec;
  } catch {
    /* no bridge data yet — fine */
  }
}

// Poll the OAuth usage endpoint if a token is configured; handle 429 backoff.
async function pollOauth() {
  const token = cfg().get("oauthToken", "").trim();
  if (!token) return;
  try {
    const json = await fetchUsage(token);
    oauthRec = normalizeOauth(json, Date.now());
    backoffMs = 0;
    out.appendLine(`[oauth] ok — 5h=${oauthRec.fivePct}% 7d=${oauthRec.sevenPct}%`);
    render();
  } catch (e) {
    if (e.status === 429) {
      backoffMs = Math.min((backoffMs || 60000) * 2, 60 * 60 * 1000);
      out.appendLine(`[oauth] 429 rate-limited — backing off ${Math.round(backoffMs / 1000)}s`);
    } else {
      out.appendLine(`[oauth] error: ${e.message}`);
    }
  } finally {
    scheduleNextPoll();
  }
}

function scheduleNextPoll() {
  clearTimeout(pollTimer);
  if (!cfg().get("oauthToken", "").trim()) return;
  const secs = cfg().get("pollIntervalSeconds", 1800);
  if (secs <= 0) return; // 0 = manual-only (poll on badge click)
  const base = secs * 1000;
  pollTimer = setTimeout(pollOauth, backoffMs || base);
}

// Write the bridge script and point ~/.claude/settings.json's statusLine at it.
// Asks before replacing a pre-existing custom statusLine.
async function setupBridge() {
  try {
    fs.mkdirSync(CLAUDE_DIR, { recursive: true });
    fs.writeFileSync(BRIDGE_PATH, BRIDGE_SCRIPT, { mode: 0o755 });

    let settings = {};
    try {
      settings = JSON.parse(fs.readFileSync(SETTINGS_PATH, "utf8"));
    } catch {
      /* no/invalid settings yet — start fresh */
    }

    const existing = settings.statusLine;
    const isOurs = existing && String(existing.command || "").includes("cc-usage-bridge");
    if (existing && !isOurs) {
      const pick = await vscode.window.showWarningMessage(
        "You already have a custom statusLine in ~/.claude/settings.json. Replace it with the Claude Usage bridge?",
        "Replace",
        "Cancel"
      );
      if (pick !== "Replace") {
        vscode.window.showInformationMessage(
          `Bridge script written to ${BRIDGE_PATH}, but your statusLine was left unchanged.`
        );
        return;
      }
    }

    settings.statusLine = { type: "command", command: `bash ${BRIDGE_PATH}` };
    fs.writeFileSync(SETTINGS_PATH, JSON.stringify(settings, null, 2) + "\n");
    vscode.window.showInformationMessage(
      "Claude Usage bridge set up. Start (or reload) a Claude Code session to see live usage."
    );
  } catch (e) {
    vscode.window.showErrorMessage(`Claude Usage: bridge setup failed — ${e.message}`);
  }
}

function activate(context) {
  item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  item.command = "claudeUsage.refresh";
  out = vscode.window.createOutputChannel("Claude Usage");
  context.subscriptions.push(item, out);

  readBridge();
  render();

  // React to the bridge rewriting the file (instant updates during a session).
  watcher = fs.watch(path.dirname(USAGE_FILE), (_e, file) => {
    if (file === "cc-usage.json") {
      readBridge();
      render();
    }
  });
  context.subscriptions.push({ dispose: () => watcher.close() });

  // Keep countdowns / stale state fresh even when nothing pushes.
  uiTimer = setInterval(render, 30000);
  context.subscriptions.push({ dispose: () => clearInterval(uiTimer) });

  context.subscriptions.push(
    vscode.commands.registerCommand("claudeUsage.refresh", () => {
      backoffMs = 0;
      pollOauth();
    }),
    vscode.commands.registerCommand("claudeUsage.setupBridge", setupBridge),
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration("claudeUsage")) {
        backoffMs = 0;
        pollOauth(); // poll right away (also reschedules the next one)
      }
    })
  );

  pollOauth(); // initial poll also schedules the next one
}

function deactivate() {}

module.exports = { activate, deactivate };
