Salesforce onboarding wizard via sf CLI. Check installation, detect authentication, guide login.

<instruction>
Actions: "check" (verify sf installed), "status" (auth + default org), "login" (detect auth and prompt user with login command), "list_orgs" (show all orgs), "set_default" (switch default org — requires org parameter with a valid alias).

When the user first asks about Salesforce, pipeline, cases, or accounts and no org is authenticated, run check, then status, then login if needed. The login action shows the user the exact command to run (sf org login web --set-default --alias SFDC for workstations, or echo "$SFDX_AUTH_URL" | sf org login sfdx-url --sfdx-url-stdin=- --set-default --alias f5 for containers).

The login action does NOT execute authentication. It detects state and tells the user what command to run.
User profile data is managed by the central profile builder via `xcsh://user?seed=true`.
</instruction>
