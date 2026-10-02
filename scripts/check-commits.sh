#!/bin/sh
# 주어진 범위의 커밋 메시지가 docs/git-rules.md 형식을 따르는지 검사한다.
# commit-msg 훅은 각자의 컴퓨터에서만 돌기 때문에, CI 에서 같은 검사를 한 번 더 한다.
# 사용: scripts/check-commits.sh <base> <head>
set -e

base=$1
head=$2
tmp=$(mktemp)
trap 'rm -f "$tmp"' EXIT
failed=0

for commit in $(git rev-list --no-merges "$base..$head"); do
  git log -1 --format=%B "$commit" >"$tmp"
  if ! .githooks/commit-msg "$tmp"; then
    echo "  커밋: $commit" >&2
    failed=1
  fi
done

exit $failed
