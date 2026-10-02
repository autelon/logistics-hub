#!/bin/sh
# GitHub 리포 설정을 코드에 적힌 상태로 맞춘다. 여러 번 실행해도 결과가 같다.
#   - 병합 방식: merge commit 만 허용, 자동 병합 허용
#   - main 보호: .github/rulesets/main.json (직접 push·force push·삭제 금지, PR 과 check 통과 필수)
# 사용: gh auth login 후 scripts/github-setup.sh
set -e

repo=$(gh repo view --json nameWithOwner --jq .nameWithOwner)

# PR 제목과 본문이 merge commit 의 메시지가 되게 한다.
gh api -X PATCH "repos/$repo" \
  -F allow_merge_commit=true \
  -F allow_squash_merge=false \
  -F allow_rebase_merge=false \
  -F allow_auto_merge=true \
  -f merge_commit_title=PR_TITLE \
  -f merge_commit_message=PR_BODY \
  --silent

ruleset=.github/rulesets/main.json
name=$(sed -n 's/^  "name": "\(.*\)",$/\1/p' "$ruleset")
id=$(gh api "repos/$repo/rulesets" --jq ".[] | select(.name == \"$name\") | .id")

if [ -n "$id" ]; then
  gh api -X PUT "repos/$repo/rulesets/$id" --input "$ruleset" --silent
else
  gh api -X POST "repos/$repo/rulesets" --input "$ruleset" --silent
fi

echo "$repo: 병합 설정과 '$name' 규칙을 적용했다."
