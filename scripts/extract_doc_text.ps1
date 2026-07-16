# 참고자료(PPT/Word) → 텍스트 추출 캐시 (인사이트 리포트의 근거 자료)
# 사용: powershell -File scripts\extract_doc_text.ps1 -Dir "data\8.5\references"
# PDF는 추출 불필요 (AI 엔진이 직접 읽음). 결과는 같은 폴더에 <파일명>.extracted.md
param([Parameter(Mandatory=$true)][string]$Dir)
$ErrorActionPreference = "Stop"

Get-ChildItem $Dir -File | ForEach-Object {
    $out = Join-Path $Dir ($_.BaseName + ".extracted.md")
    switch ($_.Extension.ToLower()) {
        ".pptx" {
            $ppt = New-Object -ComObject PowerPoint.Application
            try {
                $pres = $ppt.Presentations.Open($_.FullName, $true, $false, $false)
                $text = "# $($_.Name)`n"
                foreach ($s in $pres.Slides) {
                    $text += "`n## 슬라이드 $($s.SlideIndex)`n"
                    foreach ($sh in $s.Shapes) { if ($sh.HasTextFrame) { $text += $sh.TextFrame.TextRange.Text + "`n" } }
                }
                $pres.Close(); $text | Out-File $out -Encoding utf8
            } finally { $ppt.Quit() }
        }
        ".docx" {
            $wd = New-Object -ComObject Word.Application
            try {
                $doc = $wd.Documents.Open($_.FullName, $false, $true)
                ("# $($_.Name)`n`n" + $doc.Content.Text) | Out-File $out -Encoding utf8
                $doc.Close($false)
            } finally { $wd.Quit() }
        }
    }
}
Write-Output "추출 완료: $Dir"
