#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

const DEFAULT_PRICES = {
  modelName: "GPT-5.5",
  inputPerMillion: 5,
  cachedInputPerMillion: 5,
  outputPerMillion: 30,
};

function usage() {
  return `Codex Token Meter

Usage:
  node scripts/token-meter.mjs [options]

Options:
  --date YYYY-MM-DD       Report token delta for one local date. Defaults to today.
  --all                   Show latest cumulative totals for every rollout.
  --top N                 Limit conversation rows. Defaults to 20.
  --json                  Output JSON instead of a text table.
  --cost                  Include estimated API cost using GPT-5.5 style pricing.
  --markdown PATH         Write a Markdown report to PATH.
  --html PATH             Write a Chinese HTML dashboard to PATH.
  --codex-home PATH       Override Codex home. Defaults to %USERPROFILE%\\.codex.
  --help                  Show this help.

Examples:
  node scripts/token-meter.mjs
  node scripts/token-meter.mjs --date 2026-05-19 --cost
  node scripts/token-meter.mjs --all --top 10
  node scripts/token-meter.mjs --markdown "%USERPROFILE%\\Desktop\\codex-token-report.md"
  node scripts/token-meter.mjs --html "%USERPROFILE%\\Desktop\\codex-token-dashboard.html"
`;
}

function parseArgs(argv) {
  const args = {
    date: localDate(new Date()),
    all: false,
    top: 20,
    json: false,
    cost: false,
    markdown: null,
    html: null,
    codexHome: path.join(os.homedir(), ".codex"),
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--help" || arg === "-h") {
      console.log(usage());
      process.exit(0);
    } else if (arg === "--date") {
      args.date = requireValue(argv, ++i, "--date");
    } else if (arg === "--all") {
      args.all = true;
    } else if (arg === "--top") {
      args.top = Number.parseInt(requireValue(argv, ++i, "--top"), 10);
      if (!Number.isFinite(args.top) || args.top <= 0) {
        throw new Error("--top must be a positive integer");
      }
    } else if (arg === "--json") {
      args.json = true;
    } else if (arg === "--cost") {
      args.cost = true;
    } else if (arg === "--markdown") {
      args.markdown = requireValue(argv, ++i, "--markdown");
    } else if (arg === "--html") {
      args.html = requireValue(argv, ++i, "--html");
    } else if (arg === "--codex-home") {
      args.codexHome = requireValue(argv, ++i, "--codex-home");
    } else {
      throw new Error(`Unknown option: ${arg}`);
    }
  }

  return args;
}

function requireValue(argv, index, name) {
  if (index >= argv.length || argv[index].startsWith("--")) {
    throw new Error(`${name} requires a value`);
  }
  return argv[index];
}

function localDate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function walkRollouts(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkRollouts(fullPath, out);
    } else if (entry.isFile() && entry.name.startsWith("rollout-") && entry.name.endsWith(".jsonl")) {
      out.push(fullPath);
    }
  }
  return out;
}

function safeJson(line) {
  try {
    return JSON.parse(line);
  } catch {
    return null;
  }
}

function shortText(value, max = 64) {
  if (!value) return "";
  const compact = String(value).replace(/\s+/g, " ").trim();
  return compact.length > max ? `${compact.slice(0, max - 1)}...` : compact;
}

function parseRollout(file, targetDate) {
  const lines = fs.readFileSync(file, "utf8").split(/\r?\n/).filter(Boolean);
  let meta = null;
  let latest = null;
  const events = [];
  const range = localDayRange(targetDate);

  for (const line of lines) {
    const obj = safeJson(line);
    if (!obj) continue;

    if (obj.type === "session_meta" && obj.payload) {
      meta = {
        id: obj.payload.id ?? "",
        cwd: obj.payload.cwd ?? "",
        provider: obj.payload.model_provider ?? "",
        startedAt: obj.payload.timestamp ?? obj.timestamp ?? "",
        forkedFromId: obj.payload.forked_from_id ?? "",
      };
      continue;
    }

    const usage = obj?.payload?.info?.total_token_usage;
    if (obj.type === "event_msg" && obj.payload?.type === "token_count" && usage) {
      const event = {
        ts: new Date(obj.timestamp),
        input: Number(usage.input_tokens ?? 0),
        cached: Number(usage.cached_input_tokens ?? 0),
        output: Number(usage.output_tokens ?? 0),
        reasoning: Number(usage.reasoning_output_tokens ?? 0),
        total: Number(usage.total_tokens ?? 0),
      };
      latest = event;
      events.push(event);
    }
  }

  if (!latest) return null;

  const dayEvents = events.filter((event) => event.ts >= range.start && event.ts < range.end);
  const baseline = lastBefore(events, range.start);
  const last = lastBefore(events, range.end);
  const startedToday = meta?.startedAt ? localDate(new Date(meta.startedAt)) === targetDate : false;
  const hasUsageToday = Boolean(last && last.ts >= range.start && last.ts < range.end);
  const delta = hasUsageToday ? usageDelta(baseline ?? zeroEvent(), last) : emptyUsage();
  const dailyDeltas = buildDailyDeltas(events);

  return {
    file,
    fileName: path.basename(file),
    threadId: meta?.id ?? threadIdFromFile(file),
    cwd: meta?.cwd ?? "",
    provider: meta?.provider ?? "",
    startedAt: meta?.startedAt ?? "",
    startedToday,
    lastAt: latest.ts.toISOString(),
    dayEvents: dayEvents.length,
    delta,
    dailyDeltas,
    latest: {
      input: latest.input,
      cached: latest.cached,
      nonCached: Math.max(0, latest.input - latest.cached),
      output: latest.output,
      reasoning: latest.reasoning,
      total: latest.total,
    },
  };
}

function buildDailyDeltas(events) {
  if (events.length === 0) return [];
  const dates = [...new Set(events.map((event) => localDate(event.ts)))].sort();
  return dates.map((date) => {
    const range = localDayRange(date);
    const baseline = lastBefore(events, range.start);
    const last = lastBefore(events, range.end);
    const hasUsage = Boolean(last && last.ts >= range.start && last.ts < range.end);
    return {
      date,
      usage: hasUsage ? usageDelta(baseline ?? zeroEvent(), last) : emptyUsage(),
      events: events.filter((event) => event.ts >= range.start && event.ts < range.end).length,
    };
  }).filter((item) => item.events > 0);
}

function localDayRange(dateText) {
  const [year, month, day] = dateText.split("-").map(Number);
  const start = new Date(year, month - 1, day, 0, 0, 0, 0);
  const end = new Date(year, month - 1, day + 1, 0, 0, 0, 0);
  return { start, end };
}

function lastBefore(events, boundary) {
  let found = null;
  for (const event of events) {
    if (event.ts < boundary) {
      found = event;
    }
  }
  return found;
}

function zeroEvent() {
  return {
    ts: new Date(0),
    input: 0,
    cached: 0,
    output: 0,
    reasoning: 0,
    total: 0,
  };
}

function usageDelta(first, last) {
  const input = Math.max(0, last.input - first.input);
  const cached = Math.max(0, last.cached - first.cached);
  const output = Math.max(0, last.output - first.output);
  const reasoning = Math.max(0, last.reasoning - first.reasoning);
  const total = Math.max(0, last.total - first.total);
  return {
    input,
    cached,
    nonCached: Math.max(0, input - cached),
    output,
    reasoning,
    total,
  };
}

function emptyUsage() {
  return { input: 0, cached: 0, nonCached: 0, output: 0, reasoning: 0, total: 0 };
}

function threadIdFromFile(file) {
  const match = path.basename(file).match(/(019[0-9a-f-]+)\.jsonl$/i);
  return match ? match[1] : "";
}

function sumUsage(rows, key) {
  return rows.reduce((sum, row) => sum + row[key].total, 0);
}

function aggregate(rows, key) {
  return rows.reduce((acc, row) => {
    for (const field of ["input", "cached", "nonCached", "output", "reasoning", "total"]) {
      acc[field] += row[key][field] ?? 0;
    }
    return acc;
  }, emptyUsage());
}

function estimateCost(usage) {
  const input = (usage.nonCached / 1_000_000) * DEFAULT_PRICES.inputPerMillion;
  const cached = (usage.cached / 1_000_000) * DEFAULT_PRICES.cachedInputPerMillion;
  const output = (usage.output / 1_000_000) * DEFAULT_PRICES.outputPerMillion;
  return {
    input,
    cached,
    output,
    total: input + cached + output,
  };
}

function formatNumber(value) {
  return Math.round(value).toLocaleString("en-US");
}

function formatMoney(value) {
  return `$${value.toFixed(4)}`;
}

function makeReport(result, args) {
  const rows = result.rows.slice(0, args.top);
  const mode = args.all ? "latest cumulative totals" : `daily delta for ${args.date}`;
  const usage = result.summary;
  const lines = [];

  lines.push(`Codex Token Meter - ${mode}`);
  lines.push("");
  lines.push(`Rollouts: ${result.rollouts}`);
  lines.push(`Total tokens: ${formatNumber(usage.total)}`);
  lines.push(`Input tokens: ${formatNumber(usage.input)}`);
  lines.push(`Cached input tokens: ${formatNumber(usage.cached)}`);
  lines.push(`Non-cached input tokens: ${formatNumber(usage.nonCached)}`);
  lines.push(`Output tokens: ${formatNumber(usage.output)}`);
  lines.push(`Reasoning output tokens: ${formatNumber(usage.reasoning)}`);

  if (args.cost) {
    const cost = estimateCost(usage);
    lines.push(`Estimated API cost (${DEFAULT_PRICES.modelName}): ${formatMoney(cost.total)} (input ${formatMoney(cost.input)}, cached ${formatMoney(cost.cached)}, output ${formatMoney(cost.output)})`);
  }

  lines.push("");
  lines.push("| Rank | Tokens | Last active | Thread | Workspace | File |");
  lines.push("| ---: | ---: | --- | --- | --- | --- |");
  rows.forEach((row, index) => {
    const u = args.all ? row.latest : row.delta;
    const last = new Date(row.lastAt).toLocaleString();
    lines.push(`| ${index + 1} | ${formatNumber(u.total)} | ${last} | ${shortText(row.threadId, 18)} | ${shortText(row.cwd, 38)} | ${row.fileName} |`);
  });

  return `${lines.join("\n")}\n`;
}

function makeJson(result, args) {
  return JSON.stringify({
    mode: args.all ? "all" : "date",
    date: args.all ? null : args.date,
    rollouts: result.rollouts,
    summary: result.summary,
    estimatedCost: args.cost ? estimateCost(result.summary) : null,
    rows: result.rows.slice(0, args.top),
  }, null, 2);
}

function addUsage(target, usage) {
  for (const field of ["input", "cached", "nonCached", "output", "reasoning", "total"]) {
    target[field] += usage[field] ?? 0;
  }
}

function aggregateDailyHistory(rows) {
  const map = new Map();
  for (const row of rows) {
    for (const item of row.dailyDeltas ?? []) {
      if (!map.has(item.date)) {
        map.set(item.date, { date: item.date, usage: emptyUsage(), rollouts: 0 });
      }
      const day = map.get(item.date);
      addUsage(day.usage, item.usage);
      day.rollouts += item.usage.total > 0 ? 1 : 0;
    }
  }
  return [...map.values()].sort((a, b) => b.date.localeCompare(a.date));
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function pct(value, total) {
  if (!total) return "0.0%";
  return `${((value / total) * 100).toFixed(1)}%`;
}

function makeHtmlDashboard(result, args) {
  const todayRows = result.rows.filter((row) => row.dayEvents > 0).sort((a, b) => b.delta.total - a.delta.total);
  const allRows = result.allRows.slice().sort((a, b) => b.latest.total - a.latest.total);
  const history = aggregateDailyHistory(result.allRows);
  const todayUsage = aggregate(todayRows, "delta");
  const allUsage = aggregate(allRows, "latest");
  const todayCost = estimateCost(todayUsage);
  const allCost = estimateCost(allUsage);
  const maxDayTotal = Math.max(...history.map((day) => day.usage.total), 1);
  const generatedAt = new Date().toLocaleString();

  const metric = (label, value, sub = "") => `
    <section class="metric">
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(value)}</strong>
      ${sub ? `<small>${escapeHtml(sub)}</small>` : ""}
    </section>`;

  const usageCells = (usage) => `
    <td>${formatNumber(usage.total)}</td>
    <td>${formatNumber(usage.input)}</td>
    <td>${formatNumber(usage.cached)}</td>
    <td>${formatNumber(usage.nonCached)}</td>
    <td>${formatNumber(usage.output)}</td>
    <td>${formatNumber(usage.reasoning)}</td>`;

  const conversationRows = allRows.slice(0, args.top).map((row, index) => {
    const latest = row.latest;
    const today = row.delta;
    const last = new Date(row.lastAt).toLocaleString();
    return `<tr>
      <td>${index + 1}</td>
      <td><code>${escapeHtml(shortText(row.threadId, 20))}</code></td>
      <td>${escapeHtml(shortText(row.cwd, 42))}</td>
      <td>${formatNumber(latest.total)}</td>
      <td>${formatNumber(today.total)}</td>
      <td>${formatNumber(latest.cached)}</td>
      <td>${formatNumber(latest.output)}</td>
      <td>${escapeHtml(last)}</td>
    </tr>`;
  }).join("\n");

  const todayConversationRows = todayRows.slice(0, args.top).map((row, index) => {
    const usage = row.delta;
    return `<tr>
      <td>${index + 1}</td>
      <td><code>${escapeHtml(shortText(row.threadId, 20))}</code></td>
      <td>${escapeHtml(shortText(row.cwd, 42))}</td>
      ${usageCells(usage)}
    </tr>`;
  }).join("\n");

  const historyRows = history.map((day) => {
    const usage = day.usage;
    const width = Math.max(2, (usage.total / maxDayTotal) * 100);
    const cost = estimateCost(usage);
    return `<tr>
      <td>${escapeHtml(day.date)}</td>
      <td><div class="bar"><span style="width:${width.toFixed(2)}%"></span></div></td>
      <td>${formatNumber(usage.total)}</td>
      <td>${formatNumber(usage.cached)}</td>
      <td>${formatNumber(usage.nonCached)}</td>
      <td>${formatNumber(usage.output)}</td>
      <td>${formatMoney(cost.total)}</td>
      <td>${day.rollouts}</td>
    </tr>`;
  }).join("\n");

  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Codex Token Dashboard</title>
  <style>
    :root {
      color-scheme: light;
      --bg: #f6f3ed;
      --ink: #1f2933;
      --muted: #687281;
      --line: #ded8cc;
      --card: #fffdfa;
      --blue: #2563eb;
      --green: #0f8b6f;
      --amber: #a16207;
      --shadow: 0 16px 40px rgba(31, 41, 51, 0.08);
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      background:
        linear-gradient(135deg, rgba(37, 99, 235, 0.08), transparent 28rem),
        radial-gradient(circle at 90% 8%, rgba(15, 139, 111, 0.12), transparent 22rem),
        var(--bg);
      color: var(--ink);
      font-family: "Microsoft YaHei", "Noto Sans CJK SC", "PingFang SC", sans-serif;
    }
    main { width: min(1280px, calc(100vw - 40px)); margin: 36px auto 56px; }
    header { display: flex; justify-content: space-between; gap: 24px; align-items: flex-end; margin-bottom: 24px; }
    h1 { margin: 0 0 8px; font-size: 32px; letter-spacing: 0; }
    p { margin: 0; color: var(--muted); line-height: 1.7; }
    .pill { border: 1px solid var(--line); border-radius: 999px; padding: 8px 12px; color: var(--muted); background: rgba(255, 253, 250, 0.72); white-space: nowrap; }
    .grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 14px; margin-bottom: 18px; }
    .metric, .panel {
      background: rgba(255, 253, 250, 0.88);
      border: 1px solid var(--line);
      border-radius: 8px;
      box-shadow: var(--shadow);
    }
    .metric { padding: 16px; min-height: 112px; display: flex; flex-direction: column; justify-content: space-between; }
    .metric span { color: var(--muted); font-size: 13px; }
    .metric strong { font-size: 25px; line-height: 1.15; }
    .metric small { color: var(--muted); }
    .panel { padding: 18px; margin-top: 18px; overflow: hidden; }
    .panel-head { display: flex; justify-content: space-between; gap: 18px; align-items: center; margin-bottom: 12px; }
    h2 { margin: 0; font-size: 20px; letter-spacing: 0; }
    .note { color: var(--muted); font-size: 13px; }
    .table-wrap { overflow-x: auto; border: 1px solid var(--line); border-radius: 8px; }
    table { width: 100%; border-collapse: collapse; min-width: 900px; background: var(--card); }
    th, td { padding: 11px 12px; border-bottom: 1px solid #ece6dc; text-align: left; white-space: nowrap; }
    th { font-size: 13px; color: #4b5563; background: #faf7f1; position: sticky; top: 0; }
    td { font-size: 14px; }
    tr:last-child td { border-bottom: 0; }
    code { font-family: "Cascadia Mono", Consolas, monospace; font-size: 12px; color: #334155; }
    .bar { width: 160px; height: 10px; border-radius: 999px; background: #ebe4d8; overflow: hidden; }
    .bar span { display: block; height: 100%; background: linear-gradient(90deg, var(--blue), var(--green)); border-radius: inherit; }
    .split { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
    .warn { color: var(--amber); }
    @media (max-width: 900px) {
      main { width: min(100vw - 24px, 1280px); margin-top: 22px; }
      header, .panel-head { align-items: flex-start; flex-direction: column; }
      .grid, .split { grid-template-columns: 1fr; }
      h1 { font-size: 26px; }
    }
  </style>
</head>
<body>
  <main>
    <header>
      <div>
        <h1>Codex Token Dashboard</h1>
        <p>Generated from local Codex rollout files. This report is read-only and does not modify Codex state. Cost is an API-style estimate for ${DEFAULT_PRICES.modelName}, not an actual ChatGPT Plus charge.</p>
      </div>
      <div class="pill">Generated: ${escapeHtml(generatedAt)}</div>
    </header>

    <div class="grid">
      ${metric("Today's Tokens", formatNumber(todayUsage.total), `${args.date} · ${todayRows.length} conversations`)}
      ${metric("Today's Cached Input", formatNumber(todayUsage.cached), `Cache share ${pct(todayUsage.cached, todayUsage.input)}`)}
      ${metric("Today's Non-Cached Input", formatNumber(todayUsage.nonCached), "Estimated at the standard input price")}
      ${metric("Today's API Estimate", formatMoney(todayCost.total), `${DEFAULT_PRICES.modelName}: input ${formatMoney(todayCost.input)} · cached ${formatMoney(todayCost.cached)} · output ${formatMoney(todayCost.output)}`)}
    </div>

    <div class="grid">
      ${metric("Lifetime Tokens", formatNumber(allUsage.total), `${allRows.length} rollouts`)}
      ${metric("Lifetime Cached Input", formatNumber(allUsage.cached), `Cache share ${pct(allUsage.cached, allUsage.input)}`)}
      ${metric("Lifetime Output", formatNumber(allUsage.output), `reasoning ${formatNumber(allUsage.reasoning)}`)}
      ${metric("Lifetime API Estimate", formatMoney(allCost.total), `${DEFAULT_PRICES.modelName} pricing assumption`)}
    </div>

    <section class="panel">
      <div class="panel-head">
        <h2>Today's Conversation Ranking</h2>
        <span class="note">Sorted by today's added total tokens</span>
      </div>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Rank</th><th>Thread ID</th><th>Workspace</th><th>Total tokens</th><th>Input</th><th>Cached input</th><th>Non-cached input</th><th>Output</th><th>Reasoning output</th>
            </tr>
          </thead>
          <tbody>${todayConversationRows || `<tr><td colspan="9">No measurable token delta for today yet.</td></tr>`}</tbody>
        </table>
      </div>
    </section>

    <section class="panel">
      <div class="panel-head">
        <h2>Historical Daily Summary</h2>
        <span class="note">Reverse chronological order, based on token_count deltas around each local day</span>
      </div>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Date</th><th>Bar</th><th>Total tokens</th><th>Cached input</th><th>Non-cached input</th><th>Output</th><th>API estimate</th><th>Threads</th>
            </tr>
          </thead>
          <tbody>${historyRows}</tbody>
        </table>
      </div>
    </section>

    <section class="panel">
      <div class="panel-head">
        <h2>Cumulative Conversation Ranking</h2>
        <span class="note">Sorted by each rollout's latest cumulative total tokens</span>
      </div>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Rank</th><th>Thread ID</th><th>Workspace</th><th>Cumulative tokens</th><th>Added today</th><th>Cumulative cached input</th><th>Cumulative output</th><th>Last active</th>
            </tr>
          </thead>
          <tbody>${conversationRows}</tbody>
        </table>
      </div>
    </section>

    <section class="panel">
      <h2>Notes</h2>
      <p class="note">Current pricing assumption: input $5 / 1M tokens, output $30 / 1M tokens. The referenced screenshot did not show a separate cached-input discount, so cached input is estimated at the normal input price. ChatGPT Plus is not charged from this estimate. Very long conversations can grow token usage quickly; consider creating a handoff summary and starting a new thread after several million tokens.</p>
    </section>
  </main>
</body>
</html>`;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const sessionsDir = path.join(args.codexHome, "sessions");
  const rollouts = walkRollouts(sessionsDir);
  const parsed = rollouts.map((file) => parseRollout(file, args.date)).filter(Boolean);

  const rows = parsed
    .filter((row) => args.all || row.dayEvents > 0)
    .sort((a, b) => {
      const usageA = args.all ? a.latest.total : a.delta.total;
      const usageB = args.all ? b.latest.total : b.delta.total;
      return usageB - usageA;
    });

  const summary = aggregate(rows, args.all ? "latest" : "delta");
  const result = {
    rollouts: rows.length,
    summary,
    rows,
    allRows: parsed,
  };

  const output = args.json ? makeJson(result, args) : makeReport(result, args);
  if (args.markdown) {
    fs.mkdirSync(path.dirname(path.resolve(args.markdown)), { recursive: true });
    fs.writeFileSync(args.markdown, makeReport(result, args), "utf8");
  }
  if (args.html) {
    fs.mkdirSync(path.dirname(path.resolve(args.html)), { recursive: true });
    fs.writeFileSync(args.html, makeHtmlDashboard(result, args), "utf8");
  }
  process.stdout.write(output);
}

try {
  main();
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
