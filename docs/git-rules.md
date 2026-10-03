# Git 규칙

이 리포의 히스토리는 **나중에 이 코드를 고칠 에이전트가 읽는 자료**다.
그 에이전트는 지금의 대화, 머릿속 맥락, 리뷰 중 오간 말을 볼 수 없다. 볼 수 있는 것은 코드, `docs/`, 그리고 커밋 메시지뿐이다.
그래서 규칙의 기준은 하나다: **diff 로 알 수 없는 것을 메시지에 남긴다.**

## 커밋 메시지

```
<type>(<scope>): <무엇이 달라졌는지 한 줄>

왜: 이 변경이 필요했던 이유. 어떤 문제·요구·사실 때문인가.
결정: 고른 방식과 그 이유. 검토하고 버린 대안이 있으면 왜 버렸는지.
검증: 실제로 돌려서 확인한 것 (명령과 결과).
미검증: 확인하지 못한 것, 알고도 남긴 한계. 없으면 생략.

Refs: docs/02-domain-model.md, #123
```

### 제목 줄

- 형식은 `type(scope): 요약`, 72자 이내. `commit-msg` 훅이 검사한다.
- **type**: `feat` 동작 추가 · `fix` 잘못된 동작 수정 · `refactor` 동작 변화 없는 구조 변경 · `perf` · `test` · `docs` · `build` 의존성·빌드·도구 · `ci` · `chore` 그 외
- **scope**: 워크스페이스 이름 그대로 — `scm-api` `oms-api` `as-api` `device-api` `web` `contracts` `messaging` `db-kit` `nest-kit` `typescript-config`. 리포 전역 설정은 `repo`. 여러 개면 쉼표로 (`contracts,oms-api`).
- 요약은 **동작이나 결과**로 쓴다. "units.service 수정"이 아니라 "배송 완료 이벤트에 출고 때의 주문 참조를 이어 붙임".
- 서비스 간 규격(`@repo/contracts` 의 이벤트·요청·응답)을 호환되지 않게 바꾸면 `!` 를 붙이고(`feat(contracts)!: ...`), 본문에 `BREAKING:` 으로 어느 소비자가 무엇을 고쳐야 하는지 적는다.

### 본문

- `feat` `fix` `refactor` `perf` 는 본문이 필수다 (훅이 검사). 나머지도 이유가 자명하지 않으면 쓴다.
- **diff 를 말로 옮기지 않는다.** 어떤 파일의 어떤 줄이 바뀌었는지는 diff 가 정확히 말해 준다.
- **왜** 가 가장 중요하다. 나중의 에이전트는 "이 코드를 지워도 되는가, 바꿔도 되는가"를 판단하려고 이 커밋을 찾아온다.
  그 판단에 필요한 것: 어떤 상황을 막으려던 것인지, 어떤 제약 때문에 이 모양인지.
- **버린 대안을 남긴다.** 안 그러면 다음 에이전트가 같은 대안을 다시 시도한다.
  예: "Nest CLI 대신 tsc 직접 빌드. TS 7.0 에 컴파일러 API 가 없어 nest build 가 실패함."
- **검증과 미검증을 구분해서 사실대로 쓴다.** "`pnpm check` 통과, `mise run demo` 통과"와 "DB 없이 단위 테스트만 확인"은 다음 사람에게 전혀 다른 정보다.
- **메시지만으로 이해되게 쓴다.** "위에서 말한 대로", "리뷰 반영", "요청에 따라" 같은, 지금 대화를 알아야 뜻이 통하는 표현을 쓰지 않는다. 요청이 있었다면 그 요청의 내용을 적는다.
- 오래 유지되는 근거는 링크한다: `docs/` 문서, 이슈, 외부 문서 URL. 채팅 링크는 근거가 아니다.
- 한국어로 쓴다. 식별자·명령·type·scope 는 원문 그대로.

### 작성자

git 은 작성자(author)와 커밋한 사람(committer)을 따로 기록한다. 이 둘로 "누가 만들었나"와 "누구 계정으로 들어갔나"를 구분한다.

- **에이전트가 만든 커밋은 에이전트가 author 다.** 이름은 실제로 작업한 모델명을 쓴다.
  `git commit --author="Claude Fable 5.1 <noreply@anthropic.com>" ...`
- committer 는 바꾸지 않는다. git 설정의 사용자, 즉 그 커밋을 자기 계정으로 넣은 사람이 남는다.
- **사용자가 작업에 관여했으면 공동 작성자로 넣는다.** 방향이나 설계를 정했거나, 중간에 결정을 내렸거나, 직접 코드를 고친 경우다.
  메시지 끝에 `Co-Authored-By: <git config user.name> <git config user.email>` 을 붙인다.
- 사용자가 과제만 맡기고 내용에 관여하지 않았으면 트레일러 없이 에이전트만 author 로 둔다.
- 사람이 직접 만든 커밋은 평소대로 본인이 author 다. 에이전트의 도움을 받았으면 `Co-Authored-By: <모델명> <noreply@anthropic.com>` 을 붙인다.

나중에 `git log --author=Claude` 로 에이전트가 만든 변경만, `git log --grep='Co-Authored-By: '` 로 함께 만든 변경을 골라 볼 수 있다.

### 커밋 단위

- **논리적 변경 하나가 커밋 하나.** 리팩터링과 동작 변경을 섞지 않는다. 섞이면 "왜"가 둘이 되어 어느 줄이 어느 이유 때문인지 알 수 없다.
- **각 커밋에서 `pnpm check` 가 통과해야 한다.** `git bisect` 로 원인을 찾을 수 있어야 한다.
- 함께 가야 뜻이 통하는 것은 같은 커밋에 넣는다:
  - 스키마 변경과 그 마이그레이션 (`drizzle/`)
  - 규격(`contracts`) 변경과 그것을 내보내고 받는 쪽의 수정
  - 라우트 추가와 `routeTree.gen.ts`
  - 도메인 동작 변경과 `docs/` 의 해당 설명
- `docs/` 는 **지금 어떻게 되어 있는지**를, 커밋은 **왜 그렇게 바뀌었는지**를 담는다. 같은 내용을 양쪽에 복사하지 않는다.

## Pull Request

- **main 에는 PR 로만 들어간다.** 직접 push, force push, 브랜치 삭제는 GitHub 규칙으로 막혀 있다. 관리자도 예외가 아니다.
- **병합은 merge commit 방식만 허용한다.** 브랜치의 커밋이 그대로 main 에 남고, 그 위에 PR 을 대표하는 merge commit 이 하나 생긴다.
  - 그래서 **브랜치의 커밋 하나하나가 위의 커밋 규칙을 지켜야 한다.** "wip", "fix typo" 같은 커밋은 올리기 전에 정리한다 (`git rebase -i`, `git commit --amend`).
  - PR 제목과 본문이 merge commit 의 메시지가 된다. 제목은 커밋 제목 규칙을, 본문은 템플릿(`.github/pull_request_template.md`)을 따른다.
    PR 이 커밋 하나짜리면 그 커밋 메시지를 그대로 쓰면 된다. 여러 개면 본문은 PR 전체의 왜·결정·검증을 요약한다.
- **CI 의 `check` 와 `git-policy / merge-commits` 가 통과해야 병합된다.** `check` 는 `pnpm check` 와 PR 안 모든 커밋의 메시지 형식을, `git-policy` 는 PR 에 merge 커밋이 없는지를 검사한다.
- **병합은 머지 큐로 한다.** 큐가 최신 main(과 큐에서 앞선 PR)에 이 PR 을 합친 임시 브랜치에서 필수 검사를 다시 돌리고, 통과하면 main 에 넣는다. 그래서 브랜치를 미리 최신화하지 않아도 된다.
- **작업 브랜치는 rebase 로만 최신화한다.** main 을 브랜치로 merge 하면 `git-policy` 가 실패한다. 충돌이 나서 큐에서 빠지면 rebase 해서 다시 올린다:
  `git fetch origin && git rebase origin/main && git push --force-with-lease` (`--force` 는 쓰지 않는다).
- 병합 명령은 PR 을 올린 쪽이 아니라 리뷰한 쪽이 낸다 (`docs/agent-workflow.md`).
- PR 하나에 논리적 주제 하나. 커지면 나눈다.
- 본문의 안내 주석(`<!-- -->`)은 지우고 올린다. 해당 없는 항목은 항목째 지운다.
- 리뷰에서 나온 **결정**은 PR 본문이나 커밋 메시지에 반영한다. 댓글 스레드는 히스토리에 남지 않는다.

이 설정은 GitHub 저장소 설정(Rulesets, 병합 방식, 머지 큐)에만 있다. 값의 원본은 조직 공용 저장소 `autelon/.github` 의 `rulesets/main.json` 과 `scripts/setup-repo.sh` 이고, 이 저장소는 그 표준을 그대로 따른다(필수 검사: `check`, `git-policy / merge-commits`). 현재 값은 `gh api repos/autelon/logistics-hub/rulesets` 로 확인한다.

## PR 리뷰어와 보안 검토

이 프로젝트는 autelon 플러그인으로 운영한다(`CLAUDE.md` "autelon 운영"). 리뷰어와 보안 검토는 다음과 같다.

리뷰어: **`reviewer role`** (`.claude/agents/reviewer.md`)

- 메인 에이전트(director)가 PR 이 올라오면 `reviewer` role 에 검토를 맡긴다. 검토 기준은 `docs/agent-workflow.md` 의 "검토 기준"이다.
- reviewer 는 판정을 head sha 와 함께 PR 코멘트로 남긴다: `리뷰: 통과 (<sha>)` 또는 `리뷰: 수정 필요 (<sha>)`. 계정이 하나라 GitHub 승인(approve)은 쓰지 않는다.
- 리뷰어를 바꾸려면 이 절과 `docs/agent-workflow.md` 를 고치고 `decisions/log.md` 에 남긴다.

**보안 검토 (항상)**: 리뷰어가 누구든 모든 PR 은 `autelon:security-reviewer` 가 보안 검토를 한다. 개인 경로, Notion 주소·ID, 비밀 값, 개인 정보, 위험한 CI·의존성 변경을 본다.
판정은 PR 코멘트 `보안 검토: 통과 (<sha>)` 또는 `보안 검토: 수정 필요 (<sha>)` 로 남는다. 이 규칙은 리뷰어를 바꿔도 바뀌지 않는다.

**머지 조건**: 같은 head sha 에 `리뷰: 통과` 코멘트와 `보안 검토: 통과 (<sha>)` 코멘트가 둘 다 있어야 한다. 하나라도 없으면 머지 명령을 내지 않는다.
머지 명령은 reviewer 가 낸다: `gh pr merge <PR> --match-head-commit <리뷰한 head sha>` (`--admin` 은 쓰지 않는다). 리뷰나 보안 검토 뒤에 브랜치가 바뀌면 새 head 로 둘 다 다시 받는다.

## 히스토리 조사

코드를 바꾸기 전에, 그 코드가 왜 그 모양인지부터 확인한다.

| 알고 싶은 것                     | 명령                                                  |
| -------------------------------- | ----------------------------------------------------- |
| PR 단위로 본 main 의 흐름        | `git log --first-parent --oneline main`               |
| 한 PR 에 들어간 커밋들           | `git log <merge 커밋>^1..<merge 커밋>^2`              |
| 이 줄이 왜 이렇게 됐나           | `git blame -L <시작>,<끝> <파일>` → `git show <커밋>` |
| 이 함수가 어떻게 변해 왔나       | `git log -L :<함수명>:<파일>`                         |
| 이 식별자가 언제 생기고 사라졌나 | `git log -S '<문자열>' --oneline`                     |
| 한 워크스페이스의 변경 이력      | `git log --oneline -- apps/scm-api`                   |
| 규격을 깬 변경                   | `git log --grep='BREAKING:'`                          |
| 특정 종류의 변경                 | `git log --grep='^fix(oms-api)'`                      |
