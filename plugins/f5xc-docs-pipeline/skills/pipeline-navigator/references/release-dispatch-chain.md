# Release Dispatch Chain

When an infrastructure package (`docs-theme` or
`docs-icons`) merges to `main`, the following automated
chain runs end-to-end — no manual triggering should be
needed:

1. **Semantic Release** publishes a new npm version and
   creates a GitHub release
2. **Dispatch to `docs-builder`** — the release event
   triggers `dispatch-downstream.yml`, which sends a
   `rebuild-image` repository dispatch
3. **Docker image rebuild** — `docs-builder` rebuilds the
   container with the updated package
4. **Dispatch to content repositories** — `docs-builder`
   reads `docs-sites.json` from `docs-control` and
   dispatches `github-pages-deploy.yml` to every content
   repository
5. **GitHub Pages rebuild** — each content repository
   rebuilds its site using the new image

## Debugging

If a theme or icon change does not appear on live sites,
check each step in this chain for failures:

1. Was a new npm version published? Check the GitHub
   release in `docs-theme` or `docs-icons`.
2. Was `docs-builder` dispatched? Check
   `dispatch-downstream.yml` runs.
3. Did the Docker image rebuild? Check
   `docs-builder` workflow runs.
4. Were content repos dispatched? Check
   `github-pages-deploy.yml` runs in content repos.
5. Did content sites rebuild? Check GitHub Pages
   deployments.

Do not manually trigger `github-pages-deploy.yml` as a
workaround — fix the root cause in the dispatch chain.
