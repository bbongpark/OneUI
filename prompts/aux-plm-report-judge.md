# 보조: PLM 결과 보고 필요 판단

PLM에서 처리 완료된 액션 아이템 결과가 입력된다. 각 항목이 **임원에게 다시 보고가 필요한지** 판단하라.

보고 필요(true) 기준: 결정 당시의 조건(conditional_go 조건)에 대한 답이 나온 경우, 결과가 예상과 다르거나 부정적인 경우, 임원이 후속 보고를 명시 요구한 경우. 단순 완료 확인은 보고 불필요(false).

## 출력 스키마

```json
{
  "results": [
    {"action_id": "A1", "report_needed": true, "rationale": "<근거 1문장>",
     "status": "ok | needs_human", "reason": ""}
  ]
}
```
