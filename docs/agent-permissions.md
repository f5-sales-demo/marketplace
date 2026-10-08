# xcsh command and agent permissions

Slash commands expand the explicitly invoked prompt. Their frontmatter does not
enforce a tool allowlist. Agent `tools` uses canonical xcsh names as explicit
positive permissions; native tools enforce authorization, ownership, and input
contracts. A child agent's permissions do not change parent capabilities.
Intentional nested delegation declares named children in `spawns`; operators
without `task` cannot spawn. Direct execution is the default.

AWS and Azure authentication and reads work independently of Platform. Only
cross-plane Customer Edge operations require Platform capability and context.

Agent names are plugin-qualified (for example, `aws:cli-operator`) because xcsh
resolves exact names. Child references in `spawns` use those same identities.
