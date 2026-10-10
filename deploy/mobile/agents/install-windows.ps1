param(
  [Parameter(Mandatory=$true)][string]$Repository,
  [Parameter(Mandatory=$true)][string]$TailscaleIp,
  [Parameter(Mandatory=$true)][string]$HermesExecutable
)
$ErrorActionPreference = 'Stop'
if ($TailscaleIp -notmatch '^100\.(6[4-9]|[7-9][0-9]|1[01][0-9]|12[0-7])\.\d{1,3}\.\d{1,3}$') { throw 'Use the PC Tailscale IPv4 address' }
$node = (Get-Command node).Source
$script = Join-Path $Repository 'apps\mobile-agent\src\main.ts'
if (!(Test-Path $script) -or !(Test-Path $HermesExecutable)) { throw 'Check repository and Hermes paths' }
$arguments = '"{0}" --hermes "{1}" --host {2}' -f $script, $HermesExecutable, $TailscaleIp
$action = New-ScheduledTaskAction -Execute $node -Argument $arguments -WorkingDirectory (Split-Path $script)
$trigger = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
$settings = New-ScheduledTaskSettingsSet -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit ([TimeSpan]::Zero)
Register-ScheduledTask -TaskName 'Hermes Mobile' -Action $action -Trigger $trigger -Settings $settings -Description 'Personal Hermes connector over Tailscale'
