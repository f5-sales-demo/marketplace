---
name: gcloud-auth
description: >-
  Container-adapted Google Cloud CLI authentication. Supports service
  account key files, application default credentials, and browser
  login for headless environments. Use when the user says "login to
  gcloud", "gcloud auth login", "authenticate gcp", "connect google
  cloud", or when any Google Cloud operation fails with auth errors.
user-invocable: false
---

# Google Cloud CLI Authentication (Container-Adapted)

This skill guides authentication for headless container environments
where browser-based login may not be available.

## Authentication Methods

### Method 1: Service Account Key via Environment Variable (Recommended for Automation)

Best for CI/CD and automated environments. Uses the
`GOOGLE_APPLICATION_CREDENTIALS` environment variable pointing to
a service account key file.

**Prerequisites:**

- Service account created with appropriate IAM roles
- JSON key file downloaded and accessible in the container
- `GOOGLE_APPLICATION_CREDENTIALS` set to the key file path

**Command:**

```bash
gcloud auth activate-service-account \
  --key-file "$GOOGLE_APPLICATION_CREDENTIALS"
```

### Method 2: Explicit Service Account Key File

Use when the key file path is known but not set as an environment
variable.

**Command:**

```bash
gcloud auth activate-service-account \
  --key-file <path-to-key-file.json>
```

### Method 3: Headless Browser Login (No Launch Browser)

Use in container environments where a browser cannot open directly.
Prints a URL for the user to visit in an external browser.

**Command:**

```bash
gcloud auth login --no-launch-browser
```

### Method 4: Browser Login

Works when a browser is available (VNC enabled or desktop
environment).

**Command:**

```bash
gcloud auth login
```

### Application Default Credentials

For applications that use Google Cloud client libraries:

```bash
gcloud auth application-default login
```

## Project Selection

After authenticating, set the active project:

```bash
gcloud config set project "$CLOUDSDK_CORE_PROJECT"
```

Or if the user specifies a project ID directly:

```bash
gcloud config set project <project-id>
```

## Validation

After authenticating, verify the connection:

```bash
gcloud auth print-access-token --quiet
```

A non-zero exit code means authentication failed or is not active.

Additional verification:

```bash
gcloud auth list
gcloud config list --format=json
```

## Delegation

When executing auth commands, spawn the cli-operator agent with
these instructions:

1. Run `gcloud auth list` to check existing authentication.
2. Pick the first fully satisfied auth method in order:
   - `GOOGLE_APPLICATION_CREDENTIALS` is set and file exists ->
     `gcloud auth activate-service-account --key-file "$GOOGLE_APPLICATION_CREDENTIALS"`
   - Explicit key file path provided by caller ->
     `gcloud auth activate-service-account --key-file <path>`
   - No credentials available ->
     `gcloud auth login --no-launch-browser` (headless) or
     `gcloud auth login` (browser available)
3. Do NOT choose an option unless all its required env vars are set.
4. After auth, set project if `CLOUDSDK_CORE_PROJECT` or
   `GOOGLE_CLOUD_PROJECT` is set.
5. Validate with `gcloud auth print-access-token --quiet`.
6. Never echo service account keys or access tokens in output.

## Environment Variables

| Variable                         | Purpose                                          |
| -------------------------------- | ------------------------------------------------ |
| `GOOGLE_APPLICATION_CREDENTIALS` | Path to service account JSON key file (Method 1) |
| `CLOUDSDK_CORE_PROJECT`          | Default project ID for gcloud commands            |
| `CLOUDSDK_COMPUTE_REGION`        | Default compute region                            |
| `CLOUDSDK_COMPUTE_ZONE`          | Default compute zone                              |
| `GOOGLE_CLOUD_PROJECT`           | Alternative project ID (used by client libraries) |

## Security Rules

- Never echo service account keys, private keys, or access tokens
- Use `$GOOGLE_APPLICATION_CREDENTIALS` placeholder in output
- Never write credentials to disk outside designated secure paths
- Do not store service account keys in project files or version control
