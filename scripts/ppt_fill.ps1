# 보고 PPT 생성 — 템플릿의 {{자리표시자}}를 데이터로 치환 (PowerPoint COM)
# 사용: powershell -File scripts\ppt_fill.ps1 -Template "templates\진행보고.pptx" -Data "data\8.5\report_fill.json" -Out "data\8.5\output\진행보고.pptx"
# report_fill.json: { "리뷰진행률": "82%", "P0건수": "37", "총평": "..." }  ← 서버가 생성
param(
    [Parameter(Mandatory=$true)][string]$Template,
    [Parameter(Mandatory=$true)][string]$Data,
    [Parameter(Mandatory=$true)][string]$Out
)
$ErrorActionPreference = "Stop"
$fill = Get-Content $Data -Encoding UTF8 | ConvertFrom-Json
$ppt = New-Object -ComObject PowerPoint.Application
try {
    $pres = $ppt.Presentations.Open((Resolve-Path $Template), $false, $false, $false)
    foreach ($slide in $pres.Slides) {
        foreach ($shape in $slide.Shapes) {
            if (-not $shape.HasTextFrame) { continue }
            $tr = $shape.TextFrame.TextRange
            foreach ($p in $fill.PSObject.Properties) {
                $ph = "{{" + $p.Name + "}}"
                if ($tr.Text -like "*$ph*") { $tr.Replace($ph, [string]$p.Value) | Out-Null }
            }
            # 표 안의 자리표시자
            if ($shape.HasTable) {
                for ($r = 1; $r -le $shape.Table.Rows.Count; $r++) {
                    for ($c = 1; $c -le $shape.Table.Columns.Count; $c++) {
                        $cell = $shape.Table.Cell($r, $c).Shape.TextFrame.TextRange
                        foreach ($p in $fill.PSObject.Properties) {
                            $ph = "{{" + $p.Name + "}}"
                            if ($cell.Text -like "*$ph*") { $cell.Replace($ph, [string]$p.Value) | Out-Null }
                        }
                    }
                }
            }
        }
    }
    New-Item -ItemType Directory -Force (Split-Path $Out) | Out-Null
    $pres.SaveAs((Join-Path (Get-Location) $Out))
    $pres.Close()
    Write-Output "생성 완료: $Out"
} finally {
    $ppt.Quit()
    [System.Runtime.InteropServices.Marshal]::ReleaseComObject($ppt) | Out-Null
}
