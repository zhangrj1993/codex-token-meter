# Codex Token Meter

一个本地 Codex token 统计小工具。

它读取本机 Codex rollout 文件，生成中文统计页面，也可以显示一个右下角小窗，方便随时看今天 token 和 API 口径估算费用。

## 功能

- 今日 token 汇总
- 历史每日汇总
- 对话累计排行
- 今日对话消耗排行
- cached input / non-cached input / output / reasoning 拆分
- GPT-5.5 API 口径费用估算
- 中文 HTML 仪表盘
- Windows 右下角置顶小窗

## 数据来源

默认读取：

```text
%USERPROFILE%\.codex\sessions\...\rollout-*.jsonl
```

工具只读本地文件，不修改 Codex 状态。

## 使用方式

需要先安装 Node.js。

生成中文仪表盘：

```powershell
node .\scripts\token-meter.mjs --cost --top 20 --html "$env:USERPROFILE\Desktop\CodexTokenDashboard.html"
```

或者直接双击：

```text
CodexTokenDashboard.cmd
```

启动右下角小窗：

```text
CodexTokenStatusWidget.cmd
```

小窗支持：

- 右键：刷新 / 打开中文报表 / 显示隐藏 / 退出
- 双击：刷新并打开中文报表

## 命令行示例

统计今天：

```powershell
node .\scripts\token-meter.mjs --cost
```

统计指定日期：

```powershell
node .\scripts\token-meter.mjs --date 2026-05-19 --cost
```

查看所有对话累计排行：

```powershell
node .\scripts\token-meter.mjs --all --top 10
```

输出 JSON：

```powershell
node .\scripts\token-meter.mjs --json --cost
```

## 当前计价口径

当前按 GPT-5.5 截图口径估算：

```text
input: $5 / 1M tokens
cached input: $5 / 1M tokens
output: $30 / 1M tokens
```

截图没有单独显示 cached input 折扣，所以 cached input 暂按普通 input 价格估算。

注意：这是 API 口径估算，不代表 ChatGPT Plus 实际扣费。

## 隐私说明

这个工具不会上传任何数据。

它只在本机读取 Codex 的 rollout 文件，并在本机生成 HTML 报表。请不要把自己的 `.codex` 目录、rollout 文件、`auth.json` 或备份目录提交到 GitHub。

## 文件说明

```text
scripts/token-meter.mjs        核心统计脚本
CodexTokenDashboard.cmd        生成并打开中文 HTML 仪表盘
CodexTokenStatusWidget.ps1     右下角小窗
CodexTokenStatusWidget.cmd     启动右下角小窗
skills/token-meter/SKILL.md    Codex skill 说明
```
