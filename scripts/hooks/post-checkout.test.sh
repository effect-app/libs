#!/usr/bin/env bash
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
hook="$root/.githooks/post-checkout"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT

git init -q "$work/idempotent-main"
cd "$work/idempotent-main"
git config user.email test@example.com
git config user.name test
mkdir -p .githooks "$work/fake-home/.local/bin"
install -m 0755 "$hook" .githooks/post-checkout
printf '{}\n' >package.json
printf 'lockfileVersion: 9\n' >pnpm-lock.yaml
printf '#!/bin/sh\nroot=$(git rev-parse --show-toplevel)\nmkdir -p "$root/node_modules"\ntouch "$root/node_modules/.modules.yaml"\nprintf x >>"$root/.pnpm-runs"\nprintf "%%s\\n" "$*" >"$root/.pnpm-args"\n' >"$work/fake-home/.local/bin/pnpm"
chmod +x "$work/fake-home/.local/bin/pnpm"
git add .githooks package.json pnpm-lock.yaml
git commit -q -m init
git config core.hooksPath .githooks
HOME="$work/fake-home" git worktree add -q "$work/idempotent-linked" -b idempotent
ref=$(git -C "$work/idempotent-linked" rev-parse HEAD)
HOME="$work/fake-home" git -C "$work/idempotent-linked" -c core.hooksPath=.githooks \
  hook run post-checkout -- "$ref" "$ref" 1
test "$(wc -c <"$work/idempotent-linked/.pnpm-runs")" = 1
grep -q -- '--config.package-import-method=hardlink' "$work/idempotent-linked/.pnpm-args"

# Branch checkout must wipe packages/*/dist.
git init -q "$work/ts-clean-main"
cd "$work/ts-clean-main"
git config user.email test@example.com
git config user.name test
mkdir -p .githooks
install -m 0755 "$hook" .githooks/post-checkout
printf '{}\n' >package.json
printf 'lockfileVersion: 9\n' >pnpm-lock.yaml
mkdir -p node_modules
touch node_modules/.modules.yaml
ts_root=$(pwd)
state=$(cksum "$ts_root/package.json" "$ts_root/pnpm-lock.yaml" | cksum | awk '{print $1 ":" $2}')
printf '%s\n' "$state" >node_modules/.pnpm-checkout-state
printf '#!/bin/sh\necho pnpm-should-not-run >>"$(git rev-parse --show-toplevel)/.pnpm-runs"\n' >"$work/fake-home/.local/bin/pnpm"
chmod +x "$work/fake-home/.local/bin/pnpm"
git add .githooks package.json pnpm-lock.yaml
git commit -q -m init
git config core.hooksPath .githooks
ref=$(git rev-parse HEAD)
mkdir -p packages/effect-app/dist packages/vue/dist
printf 'poison\n' >packages/effect-app/dist/.tsbuildinfo
printf 'poison\n' >packages/effect-app/dist/foo.d.ts
printf 'poison\n' >packages/vue/dist/bar.d.ts
HOME="$work/fake-home" git -c core.hooksPath=.githooks \
  hook run post-checkout -- "$ref" "$ref" 1
test ! -e packages/effect-app/dist
test ! -e packages/vue/dist
test ! -f .pnpm-runs

mkdir -p packages/effect-app/dist
printf 'keep\n' >packages/effect-app/dist/keep.d.ts
HOME="$work/fake-home" git -c core.hooksPath=.githooks \
  hook run post-checkout -- "$ref" "$ref" 0
test -f packages/effect-app/dist/keep.d.ts

# T3 may defer installation to its setup terminal. Normal Git preparation is
# best-effort, while T3's explicit strict pass can still observe the exit code.
printf '#!/bin/sh\ntouch "$(git rev-parse --show-toplevel)/.pnpm-attempt"\nexit 17\n' >"$work/fake-home/.local/bin/pnpm"
chmod +x "$work/fake-home/.local/bin/pnpm"
rm -f node_modules/.pnpm-checkout-state .pnpm-attempt
deferred_out="$(HOME="$work/fake-home" T3CODE_DEFER_DEPENDENCY_INSTALL=1 T3CODE_WORKTREE_PREPARATION_STRICT=1 sh .githooks/post-checkout HEAD HEAD 1 2>&1)"
case "$deferred_out" in
  *"dependency installation deferred to T3 workspace initialization"*) ;;
  *) exit 1 ;;
esac
test ! -f .pnpm-attempt
HOME="$work/fake-home" sh .githooks/post-checkout HEAD HEAD 1 >/dev/null 2>&1
test -f .pnpm-attempt
set +e
HOME="$work/fake-home" T3CODE_WORKTREE_PREPARATION_STRICT=1 sh .githooks/post-checkout HEAD HEAD 1 >/dev/null 2>&1
strict_status=$?
set -e
test "$strict_status" = 17

echo "portable worktree hooks passed"
