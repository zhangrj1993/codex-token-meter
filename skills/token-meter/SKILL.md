---
name: token-meter
description: Use when the user asks to count, compare, report, or estimate cost for local Codex conversation token usage.
---

# Token Meter

Use the local script in this plugin to summarize token usage from Codex rollout files.

## Commands

From the plugin root:

```powershell
node .\scripts\token-meter.mjs
node .\scripts\token-meter.mjs --date 2026-05-19 --cost
node .\scripts\token-meter.mjs --all --top 10
node .\scripts\token-meter.mjs --markdown "$env:USERPROFILE\Desktop\codex-token-report.md"
```

## Notes

- The script reads `~/.codex/sessions/**/rollout-*.jsonl`.
- Daily usage is estimated from the first and last `token_count` events for each rollout on that local date.
- Cached input is counted separately from non-cached input.
- API cost estimates are only estimates and do not mean ChatGPT Plus charged that amount.
