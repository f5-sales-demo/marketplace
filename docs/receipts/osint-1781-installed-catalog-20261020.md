# OSINT immutable and installed catalog qualification

Receipt issue: #1781. Campaign child: #1589. Umbrella: #1579.

## Publication and installed provenance

Implementation PR #1774 is MERGED. The immutable tag `osint-framework/v1.2.1`
resolves to source `be0648cda3890d24c6b22e3d2f4f63ec75fa7938`.
Mac and Ubuntu independently downloaded the archive and matched every one of
the 100 shipped plugin files against that source.

- Archive SHA256:
  `e925c9b0439c7140fa53acac3d6094b8e7ea5195ce17a859905c80a5a7e4d59b`.
- Installed version on both hosts: 1.2.1. All 100 installed files match each
  independently verified archive.
- Qualification runtime on both hosts: 23.9.5.
- Mac qualification binary SHA256:
  `0aa0e26857d81bf1fa565ea5bde6c5ead5ae101e96cad91a4adc35d2f7b9136e`.
- Ubuntu qualification binary SHA256:
  `be6ea45f40f20d36fcad3b1b9aac4763e75720a137f3a974b3779082ae2d0ac2`.
- Resolved default runtime on both hosts: 23.9.3. Qualification used the
  separately resolved stable binary, without replacing either default.

The Ubuntu download initially could not inspect the merged source object in
its stale checkout. That failed attempt remains private. After fetching the
source, a fresh download and complete file comparison passed.

## Installed catalog command on Mac

A fresh private working directory and task-owned terminal pane ran the real
`/osint-framework:osint-catalog` entrypoint through the installed 1.2.1 plugin.
The stored user message begins with the complete shipped command body.
Supplemental scope permits only two exact read calls: the installed command
and its installed category index. The observer reported ready before prompt
submission. Both calls succeeded; no extra call or guard rejection occurred.
Each returned read matched the full installed source.
Supplemental arguments requested native-compatible output without HTML tags.
This scoped run does not establish unassisted command presentation acceptance.

The response derived 34 categories and 1,084 tools from the category rows,
showed the first twelve rows with readable Category, Skill and Tools columns,
and retained installed identity, version, reference source, completion and
catalog-only scope. It offered continuation and stated that recommendations
do not establish executed investigation or service health.

All 48 assistant frames were individually audited across 40/76/120/153 columns,
collapsed/expanded, dark/light and Unicode/ASCII/Nerd presets. They retained the
twelve-row preview, counts, identity, source and scope boundary. Another 96
native guidance frames passed width checks. Exact dispatched guidance fidelity
is separate from these structural rendering checks.

- Scenario SHA256:
  `7d93213ee6bb0334a302cd4e73be4887c265406eb7cd152b57ef47322897e02d`.
- Private successful root:
  `osint1781-installed-catalog-distinct-options-mac-20261020`.

The first Mac observer configuration contained duplicate full-file selector
options and never became ready. No prompt or tool execution was admitted.
That initialization attempt remains private. A corrected distinct-option
scenario used a fresh root. Both successful captures closed and session
shutdown was verified before the owned pane returned to its Mac shell.

## Independent Ubuntu catalog replay

The same real installed command ran in a fresh private Ubuntu directory, after
the observer reported ready on runtime 23.9.5 and plugin 1.2.1. Two exact read
calls succeeded without extras or guard rejections. Both results matched their
full installed sources, and the stored user message contained the complete
shipped command body. The response table exactly matched the first twelve
index rows, with 34 categories and 1,084 tools derived from the index.

All 48 assistant frames passed width and individual semantic checks for the
twelve-row preview, identity, version, counts, source and catalog/service-health
boundary. Complete-table continuation and native disclosure were not executed.
Another 96 native guidance frames passed individual width checks. Both captures
closed, session shutdown was verified and the owned pane returned through SSH
to its Mac shell. The two hosts produced 288 checked frames in total.
An initial audit used a lowercase-only literal for the capitalized scope label;
review of the actual response confirmed the scope, and the corrected audit
passed without repeating the workflow.

- Ubuntu scenario SHA256:
  `c9cbc087beb83f787828c58243a884f74e05d6dd9deeafd55f695442c92bd419`.
- Private root: `osint1781-installed-catalog-ubuntu-20261020`.

## Remaining acceptance

Only scoped catalog capture and independently established delivery provenance
can be supported by this receipt. Complete-table continuation, category
selection, unknown/unavailable/partial cases, long guidance and other commands,
skills and agents require separate executed evidence. Native assistant evidence
disclosure remains tracked in xcsh issue #5054; content-only public status
remains tracked in xcsh issue #5053. Account-dependent gates and external investigations remain deferred.
No URL was opened, target investigated, tool installed, authentication changed,
workspace written or subagent delegated by the catalog scenario. Raw evidence
and failed attempts remain private. Overall OSINT acceptance remains open.
