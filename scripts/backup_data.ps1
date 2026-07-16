# data/ 백업 — 서버 PC 단일 장애점 대비. 작업 스케줄러에 등록 권장 (예: 매일 19시)
# 사용: powershell -File scripts\backup_data.ps1 [-Dest "D:\backup\one-ui-agent"]
param([string]$Dest = "$env:USERPROFILE\Documents\one-ui-agent-backup")
$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
New-Item -ItemType Directory -Force $Dest | Out-Null
$stamp = Get-Date -Format "yyyyMMdd_HHmm"
$zip = Join-Path $Dest "data_$stamp.zip"
Compress-Archive -Path "$root\data", "$root\prompts", "$root\config", "$root\golden" -DestinationPath $zip -Force
# 30개 초과분 삭제
Get-ChildItem $Dest -Filter "data_*.zip" | Sort-Object Name -Descending | Select-Object -Skip 30 | Remove-Item -Confirm:$false
Write-Output "백업 완료: $zip"
