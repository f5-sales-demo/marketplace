---
name: gitlab-auth
description: >-
  Container-adapted GitLab CLI authentication. Supports token
  environment variables and browser login for headless environments.
  Use when the user says "login to gitlab", "glab auth login",
  "authenticate gitlab", or when any GitLab operation fails with
  auth errors.
user-invocable: false
---

# GitLab CLI Authentication (Container-Adapted)

This skill guides authentication for headless container environments
where browser-based login may not be available.

## Authentication Methods

### Method 1: Token Environment Variable (Recommended for Automation)

Best for CI/CD and automated environments. Use a personal access token
or project/group access token.

**Prerequisites:**

- GitLab personal access token with appropriate scopes (api, read_user,
  read_repository, write_repository)
- Token stored in `GITLAB_TOKEN` environment variable

**Command:**

```bash
echo "$GITLAB_TOKEN" | glab auth login \
  --stdin \
  --hostname "${GITLAB_HOST:-gitlab.com}"
```

### Method 2: Token via stdin (Interactive)

Use when a token is available but not stored in an environment variable.

**Command:**

```bash
echo "<token>" | glab auth login \
  --stdin \
  --hostname "${GITLAB_HOST:-gitlab.com}"
```

Never pass the token as a command-line argument — always use `--stdin`
with a pipe to avoid the token appearing in process listings.

### Method 3: Browser Login (Web)

Works when a browser is available (VNC enabled or desktop environment).
Opens a browser window for OAuth consent.

**Command:**

```bash
glab auth login \
  --hostname "${GITLAB_HOST:-gitlab.com}" \
  --web
```

### CI/CD Pipeline Authentication

In GitLab CI/CD pipelines, use the built-in `CI_JOB_TOKEN`:

```bash
echo "$CI_JOB_TOKEN" | glab auth login \
  --stdin \
  --hostname "${CI_SERVER_HOST:-gitlab.com}"
```

Note: `CI_JOB_TOKEN` has limited scope — it can only access the current
project and any explicitly allowed dependencies.

## Validation

After authenticating, verify the connection:

```bash
glab auth status
```

A successful response shows:

- Logged-in hostname
- Authenticated user
- Token type and scopes
- Git protocol (https/ssh)

## Delegation

When executing auth commands, spawn the cli-operator agent with these
instructions:

1. Run `glab auth status` to check existing authentication.
2. Pick the first fully satisfied auth method in order:
   - `GITLAB_TOKEN` set ->
     `echo "$GITLAB_TOKEN" | glab auth login --stdin --hostname "${GITLAB_HOST:-gitlab.com}"`
   - `CI_JOB_TOKEN` set (CI/CD environment) ->
     `echo "$CI_JOB_TOKEN" | glab auth login --stdin --hostname "${CI_SERVER_HOST:-gitlab.com}"`
   - `GITLAB_PAT` set (legacy) ->
     `echo "$GITLAB_PAT" | glab auth login --stdin --hostname "${GITLAB_HOST:-gitlab.com}"`
   - None satisfied -> `glab auth login --hostname "${GITLAB_HOST:-gitlab.com}" --web`
     (requires browser)
3. Do NOT choose an option unless all its required env vars are set.
4. After auth, run `glab auth status` to confirm.
5. Suppress update nag: `glab config set check_update false`
6. Never echo tokens in output.

## Environment Variables

| Variable         | Purpose                                                        |
| ---------------- | -------------------------------------------------------------- |
| `GITLAB_TOKEN`   | Personal/project/group access token (primary)                  |
| `GITLAB_HOST`    | GitLab hostname (default: `gitlab.com`)                        |
| `CI_JOB_TOKEN`   | Built-in CI/CD job token (limited scope, pipeline use only)    |
| `CI_SERVER_HOST` | GitLab server host in CI/CD (default: `gitlab.com`)            |
| `GITLAB_PAT`     | Legacy personal access token variable (fallback)               |

## Security Rules

- Never echo access tokens, personal access tokens, or job tokens
- Use `$GITLAB_TOKEN` placeholder in output
- Never pass tokens as command-line arguments — always use `--stdin`
- Do not store tokens in project files or shell history
