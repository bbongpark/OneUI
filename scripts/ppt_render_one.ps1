# 단일 PPTX → 슬라이드 PNG 렌더링 (PowerPoint COM). 서버가 PPT 업로드 후 자동 호출.
# features.json은 건드리지 않는다 — 매핑·기록은 서버(유일한 쓰기 주체)가 한다.
# 출력 파일명: <pptx베이스>_slide<번호>.png
param(
    [Parameter(Mandatory=$true)][string]$Pptx,
    [Parameter(Mandatory=$true)][string]$OutDir,
    [int]$Width = 1600, [int]$Height = 900
)
$ErrorActionPreference = "Stop"
New-Item -ItemType Directory -Force $OutDir | Out-Null
$base = [IO.Path]::GetFileNameWithoutExtension($Pptx) -replace '[^\w\-가-힣]', '_'
$ppt = New-Object -ComObject PowerPoint.Application
try {
    $pres = $ppt.Presentations.Open((Resolve-Path $Pptx), $true, $false, $false)
    $n = 0
    foreach ($slide in $pres.Slides) {
        $slide.Export("$OutDir\${base}_slide$($slide.SlideIndex).png", "PNG", $Width, $Height)
        $n++
    }
    $pres.Close()
    Write-Output "OK $n $base"
} finally {
    $ppt.Quit()
    [System.Runtime.InteropServices.Marshal]::ReleaseComObject($ppt) | Out-Null
}
