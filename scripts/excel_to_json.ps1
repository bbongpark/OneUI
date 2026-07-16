# 취합 엑셀 → features.json 인입 (Excel COM — Office 필요, 설치 제로)
# 사용: powershell -File scripts\excel_to_json.ps1 -Excel "C:\경로\취합.xlsx" -Version "8.5"
# config\excel_schema.json의 매핑을 사용한다. 갱신본이면 review_trigger_columns 변경 행만 재리뷰 표시.
param(
    [Parameter(Mandatory=$true)][string]$Excel,
    [Parameter(Mandatory=$true)][string]$Version
)
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$schema = Get-Content "$root\config\excel_schema.json" -Encoding UTF8 | ConvertFrom-Json
$outDir = "$root\data\$Version"
New-Item -ItemType Directory -Force "$outDir" | Out-Null

$xl = New-Object -ComObject Excel.Application
$xl.Visible = $false; $xl.DisplayAlerts = $false
try {
    $wb = $xl.Workbooks.Open($Excel, $null, $true)  # 읽기 전용
    $ws = if ($schema.sheet_name) { $wb.Worksheets.Item($schema.sheet_name) } else { $wb.Worksheets.Item(1) }
    $used = $ws.UsedRange
    $rows = $used.Rows.Count; $cols = $used.Columns.Count
    $hdrRow = [int]$schema.header_row
    $headers = @()
    for ($c = 1; $c -le $cols; $c++) { $headers += [string]$ws.Cells.Item($hdrRow, $c).Text }

    $idxCol = [array]::IndexOf($headers, [string]$schema.fields.feature_index) + 1
    if ($idxCol -lt 1) { throw "인덱스 열('$($schema.fields.feature_index)')을 찾을 수 없음 — excel_schema.json 확인" }

    # 기존 features.json 로드 (증분 비교용)
    $prevMap = @{}
    if (Test-Path "$outDir\features.json") {
        $prev = Get-Content "$outDir\features.json" -Encoding UTF8 | ConvertFrom-Json
        foreach ($f in $prev.features) { $prevMap[$f.feature_index] = $f }
    }
    $trigCols = @($schema.review_trigger_columns)

    $sha = [System.Security.Cryptography.SHA1]::Create()
    $feats = New-Object System.Collections.ArrayList
    for ($r = $hdrRow + 1; $r -le $rows; $r++) {
        $idx = [string]$ws.Cells.Item($r, $idxCol).Text
        if (-not $idx) { continue }
        $row = [ordered]@{}
        for ($c = 1; $c -le $cols; $c++) { if ($headers[$c-1]) { $row[$headers[$c-1]] = [string]$ws.Cells.Item($r, $c).Text } }
        $rowJson = ($row | ConvertTo-Json -Compress)
        $hash = ([System.BitConverter]::ToString($sha.ComputeHash([Text.Encoding]::UTF8.GetBytes($rowJson))) -replace '-','').Substring(0,12).ToLower()
        $prevF = $prevMap[$idx]
        $needReview = $true
        if ($prevF) {
            # 트리거 열이 안 바뀌었으면 리뷰 캐시 유지 (row_hash는 갱신)
            $changedTrig = $false
            foreach ($tc in $trigCols) { if ([string]$prevF.row.$tc -ne [string]$row[$tc]) { $changedTrig = $true } }
            $needReview = $changedTrig
        }
        [void]$feats.Add([ordered]@{
            feature_index = $idx
            name          = [string]$row[[string]$schema.fields.feature_name]
            department    = [string]$row[[string]$schema.fields.department]
            dev_status    = [string]$row[[string]$schema.fields.dev_status]
            row           = $row
            row_hash      = if ($needReview) { $hash } else { $prevF.row_hash }  # 해시 유지 = 캐시 유지
            status        = if ($prevF) { $prevF.status } else { "ingested" }
            decision      = if ($prevF) { $prevF.decision } else { $null }
            decision_conditions = if ($prevF) { $prevF.decision_conditions } else { @() }
            slides        = if ($prevF) { $prevF.slides } else { @() }
            reregistered_from = if ($prevF) { $prevF.reregistered_from } else { $null }
            input_changed = [bool]($prevF -and $needReview -and $prevF.status -in @("meeting_wait","decided"))
        })
    }
    $wb.Close($false)
    @{ version = $Version; readonly = $false; features = $feats } |
        ConvertTo-Json -Depth 8 | Out-File "$outDir\features.json" -Encoding utf8
    Write-Output "인입 완료: $($feats.Count)건 → $outDir\features.json"
} finally {
    $xl.Quit()
    [System.Runtime.InteropServices.Marshal]::ReleaseComObject($xl) | Out-Null
}
