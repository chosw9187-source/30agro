# Registers a Windows scheduled task that runs run.bat every day at 10:00.
$ErrorActionPreference = "Stop"
$dir = Split-Path -Parent $MyInvocation.MyCommand.Path
$action = New-ScheduledTaskAction -Execute "cmd.exe" -Argument "/c `"$dir\run.bat`"" -WorkingDirectory $dir
$trigger = New-ScheduledTaskTrigger -Daily -At "10:00"
$settings = New-ScheduledTaskSettingsSet -WakeToRun -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit (New-TimeSpan -Minutes 30)
Register-ScheduledTask -TaskName "ERP_Auto_Download" -Action $action -Trigger $trigger -Settings $settings -Description "SG ERP daily Excel download (10:00)" -Force | Out-Null
Write-Host "[OK] Task 'ERP_Auto_Download' registered: every day 10:00"
