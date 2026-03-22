# Task Completion Checklist

A task is **not complete** until ALL of the following
are true:

- [ ] GitHub issue created and linked to PR
- [ ] PR merged to `main`
- [ ] All post-merge workflows completed successfully
- [ ] GitHub issue is in `closed` state
- [ ] Outcome verification passed:
  - Settings applied (if governance changed)
  - Docs accessible (if docs changed)
  - Downstream dispatched (if config changed)
- [ ] Repository health checked (open issues and
  unmerged PRs reported)
- [ ] Local branches cleaned up (use `/clean_gone`)
- [ ] Current branch is `main` with clean working tree

If any post-merge workflow fails due to your changes,
fix and resubmit. Do not clean up branches until all
workflows are green.
