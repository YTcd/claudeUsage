// Pure logic: normalize each data source to a common record, then render the
// status-bar text and tooltip. No vscode dependency, so it's unit-testable.
//
// Normalized record: { fivePct, fiveReset, sevenPct, sevenReset, ts, source }
//   *Pct   : 0..100 or null
//   *Reset : unix epoch seconds or null
//   ts     : ms epoch when this data was obtained (for freshness/stale)
//   source : "session" (statusLine bridge) | "oauth"

const STALE_MAX_AGE_MS = 2 * 60 * 60 * 1000; // data older than this is untrusted

// Format a signed-ms duration as "4h 26m" / "12m" / "now".
function fmtDuration(ms) {
  const mins = Math.round(ms / 60000);
  if (mins <= 0) return "now";
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

// statusLine bridge JSON (rate_limits.*.used_percentage is already 0..100).
function normalizeBridge(data, mtimeMs) {
  const rl = (data && data.rate_limits) || {};
  const f = rl.five_hour, s = rl.seven_day;
  if (!f && !s) return null;
  return {
    fivePct: f && f.used_percentage != null ? f.used_percentage : null,
    fiveReset: f && f.resets_at != null ? f.resets_at : null,
    sevenPct: s && s.used_percentage != null ? s.used_percentage : null,
    sevenReset: s && s.resets_at != null ? s.resets_at : null,
    ts: mtimeMs,
    source: "session",
  };
}

// /api/oauth/usage JSON (utilization is a 0..1 fraction -> *100 for percent).
function normalizeOauth(json, now) {
  const pct = (w) => (w && typeof w.utilization === "number" ? Math.round(w.utilization * 100) : null);
  const reset = (w) => (w && typeof w.resets_at === "number" ? w.resets_at : null);
  const f = json && json.five_hour, s = json && json.seven_day;
  if (!f && !s) return null;
  return {
    fivePct: pct(f), fiveReset: reset(f),
    sevenPct: pct(s), sevenReset: reset(s),
    ts: now,
    source: "oauth",
  };
}

// Data is stale only when it can no longer be trusted: very old, or a window's
// reset boundary has already passed (so the cached percentage is outdated).
// Idle-but-recent data is NOT stale — the numbers don't change and the reset
// countdowns are computed from absolute timestamps.
function isStale(rec, now) {
  if (!rec) return true;
  if (now - rec.ts > STALE_MAX_AGE_MS) return true;
  for (const reset of [rec.fiveReset, rec.sevenReset]) {
    if (reset && now > reset * 1000) return true;
  }
  return false;
}

// One-line status-bar text from a normalized record (or null = no data).
function renderText(rec, now) {
  const stale = isStale(rec, now);
  const icon = stale ? "$(warning)" : "$(pulse)";
  const p = (v) => (v == null ? "?" : `${Math.round(v)}%`);
  const five = rec ? p(rec.fivePct) : "?";
  const seven = rec ? p(rec.sevenPct) : "?";
  return `${icon} 5h ${five} · 7d ${seven}${stale ? " (stale)" : ""}`;
}

// Hover tooltip markdown from a normalized record.
function renderTooltip(rec, now) {
  if (!rec) return "No usage data yet.";
  const lines = ["**Claude Code usage**", ""];
  for (const [label, pct, reset] of [
    ["5-hour", rec.fivePct, rec.fiveReset],
    ["7-day", rec.sevenPct, rec.sevenReset],
  ]) {
    if (pct == null) { lines.push(`- ${label}: no data`); continue; }
    const resetStr = reset ? ` · resets in ${fmtDuration(reset * 1000 - now)}` : "";
    lines.push(`- ${label}: ${Math.round(pct)}% used${resetStr}`);
  }
  lines.push("");
  const age = fmtDuration(now - rec.ts);
  lines.push(`_source: ${rec.source} · updated ${age === "now" ? "just now" : age + " ago"}_`);
  return lines.join("\n");
}

module.exports = {
  renderText, renderTooltip, normalizeBridge, normalizeOauth, isStale, fmtDuration, STALE_MAX_AGE_MS,
};
