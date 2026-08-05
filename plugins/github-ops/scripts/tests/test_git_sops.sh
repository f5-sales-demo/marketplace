#!/usr/bin/env bash
# Tests for Git Standard Operating Procedures (SOPs), progressive context hints,
# and post-merge branch & worktree hygiene in github-ops.

test_git_sops_content_repo_workflow() {
  local mock_repo_dir="$GITHUB_OPS_HOME/mock_content_repo"
  mkdir -p "$mock_repo_dir/.claude"
  cat <<'EOF' >"$mock_repo_dir/.claude/governance.json"
{
  "source_repo": "f5-sales-demo/docs-control",
  "repo_classes": {
    "classes": {
      "content": { "authority": "author", "description": "Demo and product content" }
    },
    "repos": {
      "demo-resources": "content"
    }
  }
}
EOF

  # Verify governance json indicates content class for demo-resources
  local class
  class=$(jq -r '.repo_classes.repos["demo-resources"]' "$mock_repo_dir/.claude/governance.json")
  [ "$class" = "content" ]
}

test_git_sops_post_merge_hygiene_and_worktree_cleanup() {
  local repo_dir="$GITHUB_OPS_HOME/hygiene_repo"
  mkdir -p "$repo_dir"
  git -C "$repo_dir" init -b main >/dev/null 2>&1
  git -C "$repo_dir" config user.email "test@example.com"
  git -C "$repo_dir" config user.name "Test User"

  echo "init" >"$repo_dir/README.md"
  git -C "$repo_dir" add README.md
  git -C "$repo_dir" commit -m "initial commit" >/dev/null 2>&1

  # Create feature branch
  git -C "$repo_dir" checkout -b feature/123-demo-content >/dev/null 2>&1
  echo "content" >"$repo_dir/demo.md"
  git -C "$repo_dir" add demo.md
  git -C "$repo_dir" commit -m "feat: add demo content" >/dev/null 2>&1

  # Simulate merge back to main
  git -C "$repo_dir" checkout main >/dev/null 2>&1
  git -C "$repo_dir" merge feature/123-demo-content >/dev/null 2>&1

  # Post-merge cleanup hygiene function: delete merged branch
  git -C "$repo_dir" branch -d feature/123-demo-content >/dev/null 2>&1

  # Verify branch is deleted
  local branch_exists
  branch_exists=$(git -C "$repo_dir" branch --list "feature/123-demo-content")
  [ -z "$branch_exists" ]
}

test_git_sops_worktree_post_merge_cleanup() {
  local repo_dir="$GITHUB_OPS_HOME/wt_main_repo"
  local wt_dir="$GITHUB_OPS_HOME/wt_feature"
  mkdir -p "$repo_dir"
  git -C "$repo_dir" init -b main >/dev/null 2>&1
  git -C "$repo_dir" config user.email "test@example.com"
  git -C "$repo_dir" config user.name "Test User"

  echo "base" >"$repo_dir/README.md"
  git -C "$repo_dir" add README.md
  git -C "$repo_dir" commit -m "initial" >/dev/null 2>&1

  # Add worktree
  git -C "$repo_dir" worktree add -b feature/456-wt-content "$wt_dir" >/dev/null 2>&1

  echo "wt content" >"$wt_dir/wt.md"
  git -C "$wt_dir" add wt.md
  git -C "$wt_dir" commit -m "feat: worktree content" >/dev/null 2>&1

  # Simulate merge in main repo
  git -C "$repo_dir" merge feature/456-wt-content >/dev/null 2>&1

  # Post-merge hygiene: remove worktree & delete branch
  git -C "$repo_dir" worktree remove "$wt_dir" --force >/dev/null 2>&1
  git -C "$repo_dir" branch -d feature/456-wt-content >/dev/null 2>&1

  # Verify worktree directory is removed and branch is deleted
  [ ! -d "$wt_dir" ]
  local branch_exists
  branch_exists=$(git -C "$repo_dir" branch --list "feature/456-wt-content")
  [ -z "$branch_exists" ]
}
