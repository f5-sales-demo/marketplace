# MEDDPICC exact corrective migration advice — 2026-10-20

Campaign: #1579; child: #1586; focused defect: #1775.
Candidate: MEDDPICC 7.8.2.

Installed 7.8.1 refused a synthetic legacy deal but its displayed migration
command failed parsing in both Bash and Zsh when the path contained an apostrophe.
The baseline output and failing source regressions remain private.

The refusal now quotes every argument and names the running Bun executable and
exact CLI source path. A harmless argument recorder verifies the complete
reported invocation for spaces, apostrophes, dollar substitutions, punctuation
and Unicode in both shells. Validate, next and score still refuse the deal and
leave its bytes unchanged. Conflicting legacy/current fields still require
manual resolution and do not display an apply command. Existing migration write
guards remain unchanged; no real deal migration was performed.

Mac engine tests passed 681 tests with 9,042 assertions; plugin checks passed
34 tests with one existing opt-in Excel check skipped. These are source checks.
Publication, installed execution, remaining long guidance and supported-host
Excel acceptance remain separate gates. Historical 7.8.1 publication and installed
guidance evidence remains valid for that historical version, not this candidate.

The historical 7.8.1 tag resolves to
`04733b385b8fe3e31d423bdbc4f8da37f60b674d`. Independent Mac and Ubuntu
archive verification matched all 100 shipped files; archive SHA-256 was
`f67a5697e11f3129dc5b1c6cd9bf9e25501a43cb6f68415841c92fb007ddaa09`.
Both installed copies also matched all 100 files under stable runtime 23.9.5.
The default runtime was left at 23.9.3.

Normal Mac read dispatch on installed 7.8.1 captured 13 actual reads and
624 individually checked native frames. Ten files matched complete source;
three matched exact 300-line prefixes. Remaining source ranges are review
L301-L317, qualification L301-L437 and update L301-L390, including terminal
empty lines. Capture closure and session shutdown were observed before the
owned pane returned to shell. Structural capture checks do not establish full
visual fidelity or executed engine workflow acceptance.

Shared tracker and ownership checks passed 12 tests with 506 assertions.
The engine does not import the xcsh runtime; its executable advice is therefore
verified directly with Bun and both shells. No new runtime API compatibility
claim is needed for this focused engine change.
