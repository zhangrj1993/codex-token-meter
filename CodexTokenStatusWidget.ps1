param(
  [switch]$Once
)

$ErrorActionPreference = "Stop"

$PluginDir = $PSScriptRoot
$ReportPath = Join-Path ([Environment]::GetFolderPath("Desktop")) "CodexTokenDashboard.html"
$NodeScript = Join-Path $PluginDir "scripts\token-meter.mjs"

function Get-TokenStats {
  $json = & node $NodeScript --json --cost --top 1 2>$null
  if ($LASTEXITCODE -ne 0) {
    throw "token-meter failed"
  }
  return $json | ConvertFrom-Json
}

function Format-CompactStats($stats) {
  $tokens = [double]$stats.summary.total
  $cost = [double]$stats.estimatedCost.total
  $inputTokens = [double]$stats.summary.input
  $cachedTokens = [double]$stats.summary.cached

  $tokenText = if ($tokens -ge 100000000) {
    "{0:N1}亿" -f ($tokens / 100000000)
  } elseif ($tokens -ge 10000) {
    "{0:N1}万" -f ($tokens / 10000)
  } else {
    "{0:N0}" -f $tokens
  }

  $cachePct = if ($inputTokens -gt 0) {
    "{0:N0}%" -f (($cachedTokens / $inputTokens) * 100)
  } else {
    "0%"
  }

  return [PSCustomObject]@{
    Line1 = "今日 $tokenText token"
    Line2 = ("API估算 $" + ("{0:N2}" -f $cost) + "  缓存 $cachePct")
    Tooltip = ("Codex Token Meter`n今日 token: $($stats.summary.total.ToString('N0'))`n输入: $($stats.summary.input.ToString('N0'))`n缓存输入: $($stats.summary.cached.ToString('N0'))`n输出: $($stats.summary.output.ToString('N0'))`nAPI估算: $" + ("{0:N4}" -f $cost))
  }
}

function Refresh-Report {
  Push-Location $PluginDir
  try {
    & node $NodeScript --cost --top 20 --html $ReportPath | Out-Null
  } finally {
    Pop-Location
  }
}

if ($Once) {
  $stats = Get-TokenStats
  $compact = Format-CompactStats $stats
  Write-Output $compact.Line1
  Write-Output $compact.Line2
  exit 0
}

Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

[System.Windows.Forms.Application]::EnableVisualStyles()

$form = New-Object System.Windows.Forms.Form
$form.Text = "Codex Token"
$form.FormBorderStyle = [System.Windows.Forms.FormBorderStyle]::None
$form.ShowInTaskbar = $false
$form.TopMost = $true
$form.StartPosition = [System.Windows.Forms.FormStartPosition]::Manual
$form.BackColor = [System.Drawing.Color]::FromArgb(34, 34, 38)
$form.ForeColor = [System.Drawing.Color]::White
$form.Width = 230
$form.Height = 54
$form.Opacity = 0.94

$panel = New-Object System.Windows.Forms.Panel
$panel.Dock = [System.Windows.Forms.DockStyle]::Fill
$panel.BackColor = $form.BackColor
$form.Controls.Add($panel)

$label1 = New-Object System.Windows.Forms.Label
$label1.AutoSize = $false
$label1.Left = 12
$label1.Top = 7
$label1.Width = 205
$label1.Height = 20
$label1.Font = New-Object System.Drawing.Font("Microsoft YaHei UI", 10, [System.Drawing.FontStyle]::Bold)
$label1.ForeColor = [System.Drawing.Color]::FromArgb(255, 255, 255)
$panel.Controls.Add($label1)

$label2 = New-Object System.Windows.Forms.Label
$label2.AutoSize = $false
$label2.Left = 12
$label2.Top = 29
$label2.Width = 205
$label2.Height = 18
$label2.Font = New-Object System.Drawing.Font("Microsoft YaHei UI", 8.5, [System.Drawing.FontStyle]::Regular)
$label2.ForeColor = [System.Drawing.Color]::FromArgb(212, 220, 230)
$panel.Controls.Add($label2)

$notify = New-Object System.Windows.Forms.NotifyIcon
$notify.Text = "Codex Token Meter"
$notify.Icon = [System.Drawing.SystemIcons]::Information
$notify.Visible = $true

$menu = New-Object System.Windows.Forms.ContextMenuStrip
$refreshItem = $menu.Items.Add("刷新")
$openItem = $menu.Items.Add("打开中文报表")
$hideItem = $menu.Items.Add("显示/隐藏")
$exitItem = $menu.Items.Add("退出")
$notify.ContextMenuStrip = $menu
$form.ContextMenuStrip = $menu
$panel.ContextMenuStrip = $menu
$label1.ContextMenuStrip = $menu
$label2.ContextMenuStrip = $menu

function Open-Report {
  try {
    Refresh-Report
    Start-Process $ReportPath
  } catch {
    [System.Windows.Forms.MessageBox]::Show("生成报表失败：$($_.Exception.Message)", "Codex Token Meter")
  }
}

function Move-Widget {
  $area = [System.Windows.Forms.Screen]::PrimaryScreen.WorkingArea
  $form.Left = $area.Right - $form.Width - 18
  $form.Top = $area.Bottom - $form.Height - 18
}

function Update-Widget {
  try {
    $stats = Get-TokenStats
    $compact = Format-CompactStats $stats
    $label1.Text = $compact.Line1
    $label2.Text = $compact.Line2
    $notify.Text = ($compact.Tooltip.Substring(0, [Math]::Min(63, $compact.Tooltip.Length)))
  } catch {
    $label1.Text = "Token 统计失败"
    $label2.Text = "右键刷新或打开报表"
    $notify.Text = "Codex Token Meter: 统计失败"
  }
}

$refreshItem.Add_Click({
  Update-Widget
})

$openItem.Add_Click({
  Open-Report
})

$hideItem.Add_Click({
  $form.Visible = -not $form.Visible
})

$exitItem.Add_Click({
  $notify.Visible = $false
  $form.Close()
})

$form.Add_DoubleClick({
  Open-Report
})

$panel.Add_DoubleClick({
  Open-Report
})

$label1.Add_DoubleClick({
  Open-Report
})

$label2.Add_DoubleClick({
  Open-Report
})

$notify.Add_DoubleClick({
  Open-Report
})

$timer = New-Object System.Windows.Forms.Timer
$timer.Interval = 60000
$timer.Add_Tick({
  Move-Widget
  Update-Widget
})

Move-Widget
Update-Widget
$timer.Start()

[System.Windows.Forms.Application]::Run($form)




