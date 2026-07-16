# 보조: 슬라이드 비전 매핑 (인덱스 파싱 실패분)

슬라이드 제목에서 인덱스 번호를 파싱하지 못한 슬라이드 이미지들과, 엑셀의 Feature 목록(인덱스 + 이름 + 부서)이 입력된다. 각 슬라이드가 어느 Feature의 자료인지 내용을 보고 추정하라.

- 슬라이드의 제목·본문 키워드를 Feature명·변경점과 대조.
- 확신이 없으면 candidates에 상위 2개까지 넣고 confidence: "low" — 억지로 하나를 고르지 마라. 사람이 대시보드에서 확정한다.

## 출력 스키마

```json
{
  "results": [
    {"slide_file": "deck2_07.png", "feature_index": "F023 또는 null",
     "candidates": ["F023", "F041"], "confidence": "high | low", "rationale": "<근거 1문장>"}
  ]
}
```
