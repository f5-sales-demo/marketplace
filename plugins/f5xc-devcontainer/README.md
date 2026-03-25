# f5xc-devcontainer

Container awareness plugin for the f5xc-salesdemos devcontainer. Provides
Claude with tool knowledge, self-awareness, and maintenance capabilities —
a unified "know thyself" system for the container.

## What it does

- Gives Claude structured knowledge of every tool installed in the container
- Covers purpose, usage examples, and authentication for each tool
- Organizes tools into 11 categories for fast lookup
- Answers identity and existential questions with live GitHub API data
- Performs self-diagnosis (health, drift, resource usage)
- Installs/removes tools and files GitHub issues for Dockerfile persistence
- Detects catalog drift between the Dockerfile and tool catalog

## Skills

| Skill            | Purpose                                              |
| ---------------- | ---------------------------------------------------- |
| `tool-catalog`   | Auto-activated knowledge base of all container tools |
| `self-awareness` | Auto-activated identity, history, and self-diagnosis |

## Agents

| Agent                    | Purpose                                                                    |
| ------------------------ | -------------------------------------------------------------------------- |
| `tool-advisor`           | Looks up tools in the catalog, returns recommendations with usage and auth |
| `tool-auditor`           | Compares Dockerfile against catalog, reports added/removed tools           |
| `container-maintainer`   | Installs, removes, searches tools; updates catalog and files GitHub issues |
| `container-introspector` | Live identity, genealogy, and self-diagnosis via GitHub API                |

## Categories

| Category               | Tools covered                                        |
| ---------------------- | ---------------------------------------------------- |
| Development            | Languages, runtimes, LSPs, build tools               |
| Security               | Pentest, vuln scanning, forensics, password cracking |
| Networking             | Packet capture, DNS, diagnostics, VPN                |
| Cloud & Infrastructure | AWS, Azure, GCP, Terraform, Kubernetes               |
| Content Authoring      | Documents, presentations, media, images              |
| Browser Automation     | Playwright, Puppeteer, headless browsers             |
| Communication          | Email, Signal, Telegram, WhatsApp, Discord, Matrix   |
| Code Quality           | Linters and formatters for 25+ languages             |
| AI Tools               | Claude Code, coding agents                           |
| System Utilities       | Shell, editors, VNC, fonts, terminal                 |
| Reconnaissance         | OSINT, subdomain enumeration, web recon              |

## Usage

Skills activate automatically:

- **Tool questions**: "which tool should I use to...", "how do I send email"
- **Identity questions**: "who are you?", "what version?", "when were you built?"
- **Self-diagnosis**: "run a health check", "self-diagnosis"

Manual agent invocation:

```
# Check catalog drift
Use the f5xc-devcontainer:tool-auditor agent

# Install a tool
Use the f5xc-devcontainer:container-maintainer agent to install <tool>

# Full introspection
Use the f5xc-devcontainer:container-introspector agent
```
