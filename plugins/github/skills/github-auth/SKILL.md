---
name: github-auth
description: >-
  Container-adapted GitHub CLI authentication. Supports token
  environment variables and browser login for headless environments.
  Use when the user says "login to github", "gh auth login",
  "authenticate github", or when any GitHub operation fails with
  auth errors.
user-invocable: false
---

# GitHub CLI Authentication (Container-Adapted)

This skill guides authentication for headless container environments
where browser-based login may not be available.

## Authentication Methods

### Method 1: GH_TOKEN Environment Variable (Recommended for Automation)

Best for CI/CD, containers, and automated environments. The gh CLI
automatically reads this variable -- no login command needed.

**Setup:**

```bash
export GH_TOKEN="ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
```

**Validation:**

```bash
gh auth status
```

When `GH_TOKEN` is set, gh CLI uses it for all API requests without
requiring `gh auth login`.

### Method 2: Token via stdin (Headless Containers)

Use when a token is available but you want it stored in the gh CLI
credential store rather than relying on env vars.

**Command:**

```bash
echo "$GH_TOKEN" | gh auth login --with-token
```

### Method 3: Interactive Browser Login

Works when a browser is available (desktop, VNC-enabled container).
Opens a browser window for OAuth device flow.

**Command:**

```bash
gh auth login
```

Follow the prompts to select GitHub.com or GitHub Enterprise,
choose HTTPS or SSH, and authenticate via browser.

## Validation

After authenticating, verify the connection:

```bash
gh auth status
```

A successful response shows the authenticated user, active account,
and token type.

## Delegation

When executing auth commands, spawn the cli-operator agent with
these instructions:

1. Check `gh auth status` to see if already authenticated.
2. If not authenticated, pick the first fully satisfied method:
   - `GH_TOKEN` is set -> run `gh auth status` (no login needed)
   - `GITHUB_TOKEN` is set -> export as `GH_TOKEN`, run `gh auth status`
   - Neither set -> suggest `gh auth login` (requires browser)
     or `gh auth login --with-token` (requires pasting a token)
3. Do NOT choose an option unless the required env var is present.
4. Never echo tokens in output.
5. After auth, run `gh auth status` to confirm.

## Environment Variables

| Variable               | Purpose                                                        |
| ---------------------- | -------------------------------------------------------------- |
| `GH_TOKEN`             | Personal access token (preferred, auto-read by gh CLI)         |
| `GITHUB_TOKEN`         | Alternative token variable (used by GitHub Actions)            |
| `GH_HOST`              | Target GitHub host (default: `github.com`)                     |
| `GH_ENTERPRISE_TOKEN`  | Token for GitHub Enterprise Server                             |

## Token Scopes

Different operations require different token scopes:

| Operation           | Required Scopes                    |
| ------------------- | ---------------------------------- |
| Read repos          | `repo` (or `public_repo`)         |
| Create PRs          | `repo`                             |
| Manage issues       | `repo`                             |
| Actions / Workflows | `repo`, `workflow`                 |
| Read user info      | (no scope needed for public info)  |
| Admin operations    | `admin:org`, `admin:repo_hook`     |

## Security Rules

- Never echo access tokens, personal access tokens, or OAuth tokens
- Use `$GH_TOKEN` placeholder in output
- Never write tokens to disk or project files
- Do not log token values in debug output
- Prefer `GH_TOKEN` env var over `--with-token` to avoid argv exposure
