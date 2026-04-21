# github-ops Rate-Limit-Aware Polling Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `f5xc-github-ops:github-ops` agent polling rate-limit-aware through ETag-cached conditional requests, adaptive intervals, and proper `403`/`429` handling, while being safe under multiple concurrent Claude Code sessions on a single workstation.

**Architecture:** Three composable shell libraries (`gh-poll.sh`,
`budget.sh`, `retry.sh`) installed into `~/.claude/github-ops/lib/` by
an idempotent `PreToolUse` hook. The agent document routes every
polling call site through these libraries. A per-host cache under
`~/.claude/github-ops/cache/` holds ETags and response bodies so
steady-state polls of unchanged CI state return `304` and do not
consume primary rate-limit budget.

**Tech Stack:** Bash 5, `gh` CLI, `jq`, `sha256sum`, `flock`, `mktemp`, `shellcheck`.
