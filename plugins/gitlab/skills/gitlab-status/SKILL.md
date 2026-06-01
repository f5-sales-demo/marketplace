---
name: GitLab-status
description: >-
  Internal skill for GitLab xcsh extension. Provides welcome screen service
  status via registerServiceStatus API. Not user-invocable.
user-invocable: false
---

This skill is a placeholder for the GitLab xcsh extension plugin.
The actual functionality is provided by the extension entry point at src/index.ts
which registers 4 native tools (glab_setup, glab_issue_list, glab_issue_view,
glab_search) and a service status check for the xcsh welcome screen.
