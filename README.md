# Codex Token Meter

A local token usage dashboard and status widget for Codex.

Codex Token Meter reads local Codex rollout files, summarizes token usage, generates an HTML dashboard, and can show a small always-on-top Windows status widget with today's token count and estimated API-style cost.

## Features

- Today's token usage summary
- Historical daily usage summary
- Cumulative conversation ranking
- Today's conversation usage ranking
- Input / cached input / non-cached input / output / reasoning breakdown
- GPT-5.5 API-style cost estimate
- HTML dashboard
- Windows floating status widget

## Data Source

By default, the tool reads:

```text
%USERPROFILE%\.codex\sessions\...\rollout-*.jsonl
```

The tool is read-only. It does not modify Codex state.

## Requirements

- Node.js
- Windows PowerShell for the floating status widget

## Usage

Generate the HTML dashboard:

```powershell
node .\scripts\token-meter.mjs --cost --top 20 --html "$env:USERPROFILE\Desktop\CodexTokenDashboard.html"
```

Or double-click:

```text
CodexTokenDashboard.cmd
```

Start the floating status widget:

```text
CodexTokenStatusWidget.cmd
```

Widget actions:

- Right-click: refresh / open dashboard / show or hide / exit
- Double-click: refresh and open dashboard

## CLI Examples

Report today's usage:

```powershell
node .\scripts\token-meter.mjs --cost
```

Report a specific date:

```powershell
node .\scripts\token-meter.mjs --date 2026-05-19 --cost
```

Show cumulative conversation ranking:

```powershell
node .\scripts\token-meter.mjs --all --top 10
```

Output JSON:

```powershell
node .\scripts\token-meter.mjs --json --cost
```

## Pricing Assumption

The current cost estimate uses this GPT-5.5 pricing assumption:

```text
input: $5 / 1M tokens
cached input: $5 / 1M tokens
output: $30 / 1M tokens
```

Cached input is currently estimated at the normal input price because the referenced pricing screenshot did not show a separate cached-input discount.

This is only an API-style estimate. It does not mean ChatGPT Plus charged this amount.

## Privacy

Codex Token Meter does not upload any data.

It only reads local rollout files and generates local reports. Do not commit your `.codex` directory, rollout files, `auth.json`, SQLite databases, or backups to GitHub.

## Files

```text
scripts/token-meter.mjs        Core reporting script
CodexTokenDashboard.cmd        Generate and open the HTML dashboard
CodexTokenStatusWidget.ps1     Floating Windows status widget
CodexTokenStatusWidget.cmd     Start the floating widget
skills/token-meter/SKILL.md    Codex skill notes
```
