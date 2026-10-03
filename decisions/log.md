# 결정 기록

autelon 도입(2026-10-04) 전의 결정은 이 파일로 옮기지 않았다. 원본은 다음 두 곳이다.

- 기술 선택과 이유: [docs/04-decisions.md](../docs/04-decisions.md)
- 도메인 설계에 대한 사용자 확인(2026-10-03·04)과 남은 질문: [docs/06-inbound-design.md](../docs/06-inbound-design.md) "결정 전에 확인이 필요한 것", "근거의 수준"

이 아래에는 autelon 운영 중의 결정을 쌓는다. director 만 쓴다.

| 날짜       | 대상         | 질문                              | 답                                                                                                                                                                                                                              | 후속 조치                                                                                                    |
| ---------- | ------------ | --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| 2026-10-04 | autelon 도입 | 작업 방식                         | 혼합: 기획·조사·결정(전문가 role, PRD, handoff, 사람 승인, board)은 director 방식, 코드 구현·PR 검토·병합은 `docs/agent-workflow.md` 그대로. 코드까지 director 방식으로 옮길지는 PRD 몇 건을 운영한 뒤 사용자가 다시 정한다     | `CLAUDE.md` "autelon 운영" 절                                                                                |
| 2026-10-04 | autelon 도입 | PR 리뷰어                         | `reviewer role` (전에는 메인 에이전트)                                                                                                                                                                                          | `docs/git-rules.md` "PR 리뷰어", `docs/agent-workflow.md` 의 검토·병합 주체 변경                             |
| 2026-10-04 | autelon 도입 | 보안 검토 규칙을 어느 문서에 둘지 | 모든 PR 에 `autelon:security-reviewer`. 머지는 같은 head sha 에 리뷰 통과와 보안 검토 통과가 둘 다 있을 때만. `docs/git-rules.md` 와 `docs/agent-workflow.md` 두 곳에 적는다                                                    | 두 문서에 반영                                                                                               |
| 2026-10-04 | autelon 도입 | role 구성                         | 전략·도메인 9개(strategist, architect, procurement-expert, transport-expert, customs-trade-expert, warehouse-expert, reverse-logistics-expert, traceability-expert, fulfillment-expert) + po, developer, reviewer, designer, da | `.claude/agents/`. 수요계획 role 은 만들지 않음(01: 계획·지시는 이 시스템의 일이 아님). 통관은 운송에서 분리 |
| 2026-10-04 | autelon 도입 | `docs/goals.md`·이 파일의 내용    | 기존 문서를 요약하고 가리킨다. 지표는 비워 두고 strategist 가 제안. 모듈형 제품은 사용자 제시 방향·미결정으로 적는다                                                                                                            | 첫 PRD 전에 strategist 에 목표·지표 체계 제안을 맡긴다                                                       |
| 2026-10-04 | autelon 도입 | Notion 사용                       | 쓴다. ID·URL 은 커밋하지 않는 `notion/` 에만 둔다                                                                                                                                                                               | 프로젝트 페이지와 Milestones·PRDs·Tasks DB 생성                                                              |
