# PPT 여러 개 → 슬라이드 PNG 내보내기 + 제목 인덱스 파싱 매핑 (PowerPoint COM)
# 사용: powershell -File scripts\ppt_to_png.ps1 -PptDir "C:\경로\ppt폴더" -Version "8.5"
# 슬라이드 제목에서 F\d{3} 패턴을 찾아 features.json의 slides에 연결. 실패분은 unmapped로 기록
# → 대시보드/AI 비전(aux-slide-mapping)으로 후처리.
param(
    [Parameter(Mandatory=$true)][string]$PptDir,
    [Parameter(Mandatory=$true)][string]$Version,
    [int]$Width = 1600, [int]$Height = 900
)
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$outDir = "$root\data\$Version\slides"
New-Item -ItemType Directory -Force $outDir | Out-Null

$featPath = "$root\data\$Version\features.json"
$feats = Get-Content $featPath -Encoding UTF8 | ConvertFrom-Json
$fmap = @{}; foreach ($f in $feats.features) { $fmap[$f.feature_index] = $f; $f.slides = @() }

$ppt = New-Object -ComObject PowerPoint.Application
$unmapped = New-Object System.Collections.ArrayList
try {
    Get-ChildItem $PptDir -Filter *.pptx | ForEach-Object {
        $pres = $ppt.Presentations.Open($_.FullName, $true, $false, $false)  # ReadOnly, WithWindow:=False
        $base = [IO.Path]::GetFileNameWithoutExtension($_.Name)
        foreach ($slide in $pres.Slides) {
            $title = ""
            try { $title = $slide.Shapes.Title.TextFrame.TextRange.Text } catch {}
            $m = [regex]::Match($title, 'F\d{3}')
            $sn = $slide.SlideIndex
            if ($m.Success -and $fmap.ContainsKey($m.Value)) {
                $k = ($fmap[$m.Value].slides).Count + 1
                $png = "$($m.Value)_$k.png"
                $slide.Export("$outDir\$png", "PNG", $Width, $Height)
                $fmap[$m.Value].slides += $png
            } else {
                $png = "unmapped_${base}_$sn.png"
                $slide.Export("$outDir\$png", "PNG", $Width, $Height)
                [void]$unmapped.Add(@{ slide_file = $png; source = $_.Name; title = $title })
            }
        }
        $pres.Close()
    }
    $feats | ConvertTo-Json -Depth 8 | Out-File $featPath -Encoding utf8
    @{ unmapped = $unmapped } | ConvertTo-Json -Depth 4 | Out-File "$root\data\$Version\unmapped_slides.json" -Encoding utf8
    Write-Output "내보내기 완료 — 미매핑 $($unmapped.Count)건 (unmapped_slides.json, AI 비전/수동 지정 대상)"
} finally {
    $ppt.Quit()
    [System.Runtime.InteropServices.Marshal]::ReleaseComObject($ppt) | Out-Null
}
