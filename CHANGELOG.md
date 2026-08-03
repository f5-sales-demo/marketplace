# Changelog

All notable changes to the f5-sales-demo marketplace will
be documented in this file.

The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

- **`github`** v1.2.3 — `gh_exec` now returns stderr from successful commands when stdout is empty,
  so commands such as `gh auth status` expose their result to the calling model. Successful commands
  that emit both streams continue to prefer stdout, and the existing output limit applies to either
  selected stream ([#1010](https://github.com/f5-sales-demo/marketplace/issues/1010)).

- **`meddpicc`** v7.5.0 — French, Spanish, German, Brazilian Portuguese, Korean,
  Simplified Chinese, Traditional Chinese, Italian, Hindi, and Thai complete the
  left-to-right workbook locale set.

  - Every catalogue explicitly covers the same 199 workbook-owned sources as Japanese,
    including the seven agreed English sentiment and rating identities, preserved product names,
    and natural-language boolean labels, with the full-source freshness stamp and reverse-mapping
    collision guards intact.
  - Locale-specific column widths and row-height scales accommodate longer Latin,
    Devanagari, Thai, Korean, and Chinese text without changing the workbook grid.
  - Each locale is verified through planning, formulas, conditional formatting,
    serialization, and read-back under an English process locale; the workbook's own
    `MeddpiccLocale` property remains the only authority during reading.

- **`meddpicc`** v7.4.0 — Japanese is now a shipped workbook locale. `generate --locale ja`
  translates the tab, labels, schema guidance, dropdowns, formulas, conditional formatting, notes,
  and completion statuses while leaving deal-owned values untouched.

  - The catalogue covers all 199 workbook-owned source strings, carries a full SHA-256 freshness
    stamp, and is refused when a required source is missing, stale, empty, ambiguous, or outside the
    documented sizing bounds.
  - One loaded locale context drives planning and serialization. Japanese enum and boolean values
    read back from either their canonical, English, or translated forms, and the workbook records
    `MeddpiccLocale` so reading never depends on the machine's ambient language.
  - Japanese column-width and row-height overrides preserve the grid while accommodating CJK text.
    The real-Excel UAT verifies all thirteen completion formulas, localized dropdowns and formatting,
    autofit sizing, notes, edits, overflow refusal, and the partly-qualified deal in both English and
    Japanese; the six Japanese captures show no clipped or stranded text.

- **`meddpicc`** v7.3.0 — a workbook now records the words it put in its label cells, so a revised
  translation is no longer reported as rows having moved.

  `MeddpiccFingerprint` covers the deal's identity and the input-cell layout, and deliberately not the
  displayed text: a workbook on someone's desk has to survive an edit to the JSON that moves no cell.
  Revising a label moves no cell either. So the stamp matched to the character while every label
  anchor read different words, and the only conclusion available was the wrong one — measured on the
  example deal, 115 revised strings produced five rejections all announcing that the rows had moved
  and that no cell could be trusted. Nothing had moved, and the sheet in front of the reader looked
  untouched.

  The new `MeddpiccAnchorText` property is a hash of exactly the strings the reader compares, which is
  what makes the three cases exhaustive — if it differs then some anchor differs, so there is no
  fourth case where it disagrees and the workbook still reads back. An anchor failure now says which
  happened:

  - **the hash matches** — the rows really have moved, and no cell can be trusted to be the one it was;
  - **the hash differs** — the labels were revised afterwards, so they can no longer confirm that the
    rows are where they were, whether or not anything moved as well. It does not claim the cells are
    still in place: the hash proves the two label sets differ and is silent on everything else, and a
    workbook can have both a revised translation and a locally tidied sheet;
  - **the property is absent** — the workbook predates the stamp and cannot answer. It names both
    possibilities and asserts neither, because the advice is the same either way and picking the wrong
    one sends somebody hunting for an edit they never made.

  Nothing is refused that was not refused before: an unchanged workbook still reads back, and the
  hash is only consulted once an anchor has already failed.

- **`salesforce`** v1.3.7 — replaces legacy account, opportunity, My Domain, and email fixtures with
  canonical Example values.

- **`salesforce-legacy`** v1.0.2 — uses the canonical `example-corp` My Domain prefix in setup
  documentation.

- **`osint-framework`** v1.0.3 — replaces legacy business-search examples with Example Corp.

- **`meddpicc`** v7.2.2 — replaces the legacy deal fixture with Example Corp and Example Partners.

- **`meddpicc`** v7.2.1 — a serialization contract for text the writer does not control. No behaviour
  change: every part of the generated workbook is byte-identical except `docProps/custom.xml`, which
  records the engine version, because no value in play today contains any of these characters. (The
  entry first claimed the whole file was byte-identical with the same sha256. That was measured before
  the version bump and stopped being true with it.)

  Three hazards, all silent, none of them an XML problem — Excel's own grammar is what breaks, so escaping
  the XML leaves the text intact and wrong.

  - **A comma in a dropdown value became two entries.** The inline list is a quoted, comma-joined string
    with no escape for a comma, so `Yes, please` offered `Yes` and a second entry beginning with a space — and the reverse map would
    then fail to recognise whichever a rep picked. Refused at build time, naming the value and the range;
    escaping is not an option, and backing the validation with a hidden range is a much larger change that
    buys nothing while no value needs it.
  - **A quote in a dropdown value ended the list early**, the whole list being one quoted string. Not
    refused, though: unlike a comma, a quote **is** representable by doubling. Verified in Excel — a list
    written `"He said ""yes"",No"` reads back as `He said "yes",No` and offers the two entries intended. My
    first version refused it, which review rightly called an avoidable outage the first time a translation
    used ordinary punctuation. The 255-character budget is measured on the escaped text, since that is what
    Excel receives and a value full of quotation marks costs twice what it looks like.
  - **A quote in a formula word closed its string early.** `He said "yes"` emitted `"He said "yes""` where
    Excel needs `"He said ""yes"""`, leaving Excel to parse the remainder as syntax. Now doubled — and
    **verified in Excel**, which evaluates the emitted formula to `He said "yes"` and echoes it back
    doubled, since only Excel can settle its own grammar.
  - The **255-character cap** on an inline list was already enforced and had **no test** — the other `255`
    assertions in that file are about the print header. Covered now, because CJK and Devanagari
    translations are what will push a list toward it.
  - **All four sinks share one helper.** A label reaches an Excel formula in four places, and the first
    version escaped one: review found a section label in an `INDEX/MATCH`, the compiled completion statuses,
    and the words the conditional formats compare. `excelString` is what they all call now.

  Latent today, in the same way #929 was: localisation (#925) is what makes it live, where 192
  model-authored strings per locale meet punctuation that is unremarkable in prose.
- **`salesforce`** v1.3.6 — the pipeline report is built from the org's discovered schema
  rather than one org's custom fields. Behaviour on an org that has those fields is unchanged;
  every other org gets a report instead of an empty one.

  The report named seven fields no Salesforce org is guaranteed to have — `FYB_Total_Price__c`,
  `Subscription_Renewal__c`, `Renewal__c`, `True_ACV__c`, `Upsell_ACV__c`,
  `Product_Segmentation__c`, `Use_Case_Category__c` — plus a specific territory field. Elsewhere
  those queries fail, the error is swallowed, and the empty result renders as an empty pipeline.
  "No renewals" and "could not look for renewals" are very different claims.

  - **Capability is decided before a query is built**, from the field catalog the context probe
    caches. `planPipelineQueries` is pure and covered by 13 cases; the generator selects and
    filters only on fields the plan names, so a query naming an absent field cannot be formed.
  - **Sections that cannot be built say so**, under a "Not Available For This Org" heading,
    naming the field that was missing.
  - **Adaptation is per field.** Line items survive a missing renewal filter; renewals survive on
    the flag alone, valued by the standard `Amount`; ACV fields are taken individually;
    classification degrades to `other` with no segmentation field. An undescribed org attempts
    everything as before, so a stale cache cannot downgrade a working report.
  - The context probe now describes `OpportunityLineItem` alongside `Opportunity`, and the fiscal
    year opens on a configured month instead of a hardcoded November.

  Measured against a real org, same quarter, before and after: net new 5 accounts / $1,484,038.01,
  renewals 3 / $1,807,244.10, 30 line items, 23 SKUs, FY26 — identical. Declaring stock
  capabilities against that same org: 3 queries, 0 failures, no custom field named, and still a
  populated report from `Opportunity.Amount`.

- **`meddpicc`** v7.2.0 — the locale is decided once, early, from every input. `generate` takes
  `--locale`. English output is unchanged, because English is still what everything resolves to.

  It used to be decided inside `workbookProperties`, which runs *after* the sheet is laid out, and from
  one input: `metadata.locale`. So nothing in planning could know the locale, the refusal for an
  unsupported one arrived after all the layout work, and a rep whose machine is in Japanese had no way to
  ask for anything else.

  - **Precedence**: `--locale` > `metadata.locale` > `MEDDPICC_LOCALE` > `LC_ALL` > `LC_MESSAGES` > `LANG`
    > macOS `AppleLocale` > `en`. That is POSIX order for the language of user-facing messages, which is
    what a workbook's text is: `LC_ALL` overrides everything, `LC_MESSAGES` governs the message category,
    `LANG` is the default for every category.
  - **Normalization**: `fr_CA.UTF-8@euro` → `fr-ca` → French, once French ships. Canonical form is the
    lowercase slug — `pt-br`, `zh-cn` — matching the schema enum and i18n-core's `slug`, not BCP-47's
    `pt-BR`, because two spellings of one locale is how a workbook records one nothing recognises.
    Chinese resolves by script where given and by region otherwise: `zh_Hant_TW` and `zh_TW` → `zh-tw`,
    bare `zh` → `zh-cn`.
  - **Explicit and ambient failures are opposites.** `--locale ko` is refused and names what is shipped —
    somebody asked for something specific. `LANG=is_IS` falls back to English silently, because a rep
    wants a workbook, not a lecture about Icelandic. Same unsupported locale, opposite right answers,
    which is why one function decides.
  - **The stamp must agree with the deal.** Moving resolution to the caller opened a hole a pre-existing
    test caught: `generateWorkbook` without a locale would have stamped English over a deal explicitly
    asking for Korean, which is worse than the refusal it replaced. It now refuses when the two disagree —
    not resolving twice, but checking that whoever resolved honoured the deal.
  - **Also fixed, and wider than the locale**: `flag()` matched `--out deal.xlsx` and not
    `--out=deal.xlsx`, for every flag the CLI has, so `--out=path` wrote to the default path with exit 0
    and nothing said. One parser now reads both spellings, refuses a flag given twice or given nothing, and
    treats a following flag as no value rather than as the value.
  - **Not in this change**: the locale is not yet threaded into `planWorkbook`. It has nothing to do there
    until translated strings exist, and a parameter nothing reads would be speculative. It lands with the
    loader.
- **`salesforce`** v1.3.5 — schema is discovered at runtime instead of guessed, and a rejected column
  now says which one. Three defects compounded into a query the agent could not recover from.

  The query prompt told the model to read `Opportunity.CompetitorName`, which exists on no org — it
  belongs to the child `OpportunityCompetitor` object. Given a name that cannot work, the model
  emitted the nearest plausible spelling, `Competitor__c`. `detectSfError` then looked for the error
  code in the sf payload's `message`, but sf puts it in `name`, so every real `INVALID_FIELD` fell
  through to a generic exec error whose one actionable line came last — exactly the line a host UI
  truncates. And nothing offered a way to look a field up, so the agent shelled out to raw `sf`.

  - **New `sf_describe` tool.** Returns an object's real fields filtered by a concept match on both
    API name and label, with active picklist values and matching child relationships. Bounded on
    purpose: a mature Opportunity carries several hundred fields, so an unfiltered call returns the
    standard ones plus a count. Cells escape `|`, which a real picklist value contains.
  - **Errors classify on `name`/`code`** and lead with `No such column 'X' on entity 'Y'` plus a
    pointer to `sf_describe`. Covers `INVALID_FIELD`, `MALFORMED_QUERY`, `INVALID_TYPE` and
    `INVALID_QUERY_FILTER_OPERATOR`; tests use payloads captured verbatim from a live org, because the
    test that previously covered this fed a message shape sf never emits.
  - **Nothing org-specific is hardcoded**, since the plugin ships beyond one org. The query prompt no
    longer names particular territory fields or stage literals. The context probe reuses the describe
    it already ran to cache the field catalog, replacing six booleans keyed off one org's field names.
    Territory selection is empirical — candidates are ranked by schema, then probed against the user's
    pipeline — replacing a hardcoded field that was not even `groupable`, so it could not back the
    `GROUP BY` it was used for. Discovered stage names and forecast categories reach the session hint.
  - Live UAT (`scripts/tests/live-uat.ts`) drives the real tools against an authenticated org and
    skips cleanly without one.

- **`meddpicc`** v7.1.0 — the engine can enumerate the text it renders, and prove the list complete.
  Additive: a new module and its tests, no generation path touched.

  Localisation (#925) needs that list, and three attempts at writing it down by reading the code gave
  three different answers — 129, then 198, then 199 — each wrong in a way nothing could catch, because
  there was nothing to check against.

  - `engine/translatable.ts` declares six sources and returns every string the engine chooses to render,
    with which source each came from. **199 strings**, and the number comes from running it.
  - **The test is the point.** It generates a workbook, extracts every string the workbook shows, and
    asserts the catalogue covers exactly that — nothing missing, nothing surplus. It cannot miss a source
    because it does not depend on knowing what the sources are.
  - Two things that only came out by asking the artifact. **All 40 rubric lines live inside a formula**:
    the "What This Score Means" column is `IF(D20=4,"Committed — …",IF(D20=3,"Quantified — …",…))`, so it
    follows the score live in Excel. They are the most prose-heavy text on the sheet and not one of them
    is a cell value anywhere, so an oracle that skipped formula cells — as mine first did — declared the
    catalogue complete while missing them. And a deal-supplied value must never be catalogued, which is
    what `plan.inputCells` is asked rather than guessed at: an account name is rendered, and translating
    it would be corrupting the deal.
  - `note: "elementDefinition"` is excluded by name: `NoteSource` is a discriminator, not prose, and a
    key-name heuristic cannot tell a type tag from text.

- **`meddpicc`** v7.0.1 — three formulas stop spelling enum words by hand. No behaviour change: every
  OOXML part of the generated workbook is byte-identical to v7.0.0 except `docProps/custom.xml`, which
  differs only in the recorded engine version, and the resolved formulas still read `"Green"` and
  `"Unknown"` exactly as before.

  `generate.ts` has a `FORMULA_WORDS` table for one purpose, and says so: *"One source of truth for a
  spelling that appears in two places — the cell and the formula that counts it."* Three formulas did
  the thing that comment forbids — `scoreRating` emitted `"Green"`/`"Yellow"`/`"Red"`, and the two
  sentiment tallies matched `"Unknown"` and `"Negative"` — while `xlsx.ts` held a third copy of the
  rating words in its conditional-format rules, beside two presets that already routed through
  `enumLabel`.

  - Nothing was broken. Every spelling agreed, so this was latent — and latent in the way that matters:
    rename a sentiment value in the schema and the `COUNTIF` silently returns nought, reporting no
    negative-sentiment stakeholders when there are four. No error, no failed test, nothing to notice.
  - **Three guards, because the table alone cannot promise much.** `FORMULA_WORDS` is a module constant
    and the schema arrives as an argument, so it cannot read the schema; and `enumLabel` falls through
    for a value it has no entry for, which means `enumLabel('Red')` is `'Red'` whatever the schema says.
    So the tests do the real work: no spec formula may spell an enum word by hand, every word the table
    offers must still be one a dropdown shows, and every word a conditional format compares must be too.
    A rename now fails the build instead of going half-done.
  - This is also what lets localisation (#925) translate the sentiment and rating dropdowns at all.

- **`meddpicc`** v7.0.0 — a deal has to say which deal it is. **Breaking**: a deal file whose
  `dealId`, `accountName`, `dealName`, or whose first stakeholder's `name` or `title`, is an empty
  string was valid and is now refused, with the path named.

  `required` asks whether a key is present, not whether it says anything, so
  `{"dealId": "", "accountName": "", "dealName": ""}` validated cleanly — and the engine went on to
  name the file and the round-trip stamp after nothing at all.

  - **The keyword had to be implemented, not just written down.** The validator is a hand-written
    draft-2020-12 subset, and `minLength` was not in it. Adding the constraint to the schema alone
    would have read as a constraint and enforced nothing.
  - **So an ignored keyword now fails the build.** `validate.ts` declares which keywords it enforces,
    which it is deliberately lenient about (`format`, `pattern`), and which are annotations; a test
    refuses any keyword the schema uses that appears in none of them, and a second test proves every
    keyword claimed as enforced really does reject something, so the declaration cannot lie.
  - **Bounded only where emptiness means nothing**: the three identity fields, and a stakeholder's
    name and title, both of which are already `required`. Prose, evidence and notes stay legitimately
    empty — a deal is worked over weeks, and the completion rules depend on telling blank from filled.
  - **A space is not a name either**, and that one was worth closing rather than documenting. A deal
    with `dealId: " "` validated, generated, and then failed on read-back of its own unchanged
    workbook, because the reader trims and proposes clearing the id — a file that cannot survive its
    own round trip, which is the whole thing an identity field exists to prevent. Said in the
    vocabulary the specification already has, `pattern: "\S"`, rather than by giving `minLength` a
    private trimmed meaning that would mislead everyone reading the schema.
  - **`pattern` is enforced now**, which also turned on the three Salesforce-ID prefixes (`^006`,
    `^001`, `^005`) that had been accepted unconditionally. Checked against both the example deal and
    a real one before flipping it, and a pattern the engine cannot compile is reported against the
    schema path rather than crashing or being skipped.
  - A zero-width character still counts as content, to `validate` and the reader alike: `\S` and
    `String.prototype.trim` draw the line in exactly the same place, and a validator stricter than the
    reader would be the same mismatch pointing the other way.

- **`meddpicc`** v6.3.0 — the completion statuses follow the sheet. Not breaking: no address moved, so
  a v6.2.0 workbook still reads back.

  The thirteen section statuses were literals, computed when the workbook was written. Fill in the
  missing evidence during a live review and the sheet went on calling the section not started — in the
  one column whose job is to say where the deal stands.

  - **One rule, two readers.** Each section's rule is data now: two predicates, `complete` and
    `started`, over deal paths, in a vocabulary of six leaves and two combinators. The engine evaluates
    them against the deal and the generator compiles the same ones into formulas, so there is no second
    set of rules free to drift. Six kinds covered all thirteen rules; a seventh would have been a rule
    the sheet could not express, which is worth discovering in TypeScript rather than in Excel.
  - **Nothing in the compiler knows a coordinate.** `plan.inputCells` already maps every deal path to
    the cell it landed in, so a rule naming `qualification.metrics.evidence` resolves to a cell and that
    element's responses to the range of its rows — and a rule naming a field the sheet does not show
    refuses to compile rather than emitting a formula that reads `#NAME?` mid-review.
  - **The scorecard follows for free.** `sectionsComplete` already counted the status column, so the
    count and the completion percentage are live too.
  - **What makes a row an entry belongs to the list.** `ENTRY_FIELDS` names each list's declared fields
    once, and both halves of a rule read it — as does the compiler, which looks each one up as a column.
    So the two readers count the same rows by construction, and a rule naming a field the workbook does
    not show fails at generation rather than counting a row the sheet cannot see. Three rounds of review
    got here: first the leftmost column, then every column, then the fields themselves, when the reviewer
    pointed out that the schema does not forbid extra properties — `[{"unmappedField":"x"}]` validates,
    and the sheet has nowhere to show it.
  - **A score cell is read the way the reader reads it.** `N("3")` is nought, while the round-trip reader
    accepts a textual "3" and applies it as 3 — so a pasted score showed 3 on the sheet, left the status
    partial, and changed meaning on read-back. `IFERROR(VALUE(…),0)` reads it as the reader does and keeps
    a blank or a word at nought, as the engine does.
  - **A completion block can sit anywhere in the spec.** The statuses were compiled at the end of each
    sheet, against the input cells known so far — so a two-sheet spec that passes `check-spec` failed to
    generate when the Completion block came first. They are compiled once, after every sheet is laid out.
  - **An entry counts when it has something in it — in the engine too.** The old rule counted the array's
    length, so `team.internal: [{}]` completed the whole Team section: one object with no fields, which
    the schema permits and which is not a team member in any sense. No sheet could ever agree, because an
    entry with every cell empty is indistinguishable from one of the pre-allocated blank rows. So both
    readers ask the same question now, and it is the defensible one. This is the **one** class of answer
    that moved, and the suite records it against the frozen oracle rather than quietly absorbing it.
  - **A cell on another sheet is named with its sheet.** Latent today, since the workbook is one laid-out
    sheet — but a two-sheet spec passes `check-spec`, and a bare `$D$20` would then mean whatever sits at
    D20 on the sheet the formula is on. Excel evaluates that without complaint, which is the worst way
    for it to be wrong. The quoting rule comes from the same `sheetPrefix` that `{{ref:…}}` already uses.
  - **A row is an entry when ANY of its fields is filled in.** The schema permits an entry that fills
    in anything but its first field — `team.internal: [{"role":"SE"}]` validates, and the engine calls
    the team complete — so counting the name column alone made the sheet answer not_started on exactly
    that data. Found by the second-opinion review, and now a fixture of its own in the Excel run. One
    case is left and cannot be closed from a sheet: an entry whose every field is empty is
    indistinguishable from one of the pre-allocated blank rows.
  - **The whitespace the two readers disagree about is removed first.** Excel's `TRIM` takes ordinary
    spaces only, while the engine's `trim()` also takes tabs, newlines and non-breaking spaces — so a
    value pasted from a web page read as filled to the sheet and empty to the engine. `CLEAN` handles
    the control characters and the non-breaking space is substituted, which also cut the longest
    compiled formula from 5483 characters to 2602 against Excel's cap of 8192. The writer refuses a
    formula past that cap now, because Excel's answer to one is to prompt for repair and empty the cell.
  - **The refactor is proved rather than reviewed.** The previous implementation is frozen in the suite
    as an oracle and asked the same question as the new one over every combination each rule can see —
    all 96 an element rule has, and every shape the five collection sections can take. Exhaustive rather
    than random, so no seed can miss a case.
  - **Excel is asked directly**: all thirteen statuses agree with the engine on the example deal *and*
    on the partly-qualified fixture, and setting an element's score to 0 in Excel moves its status from
    Complete to Partial — what the engine says about the same deal with that score changed, computed by
    the engine rather than written down here.

- **`meddpicc`** v6.2.0 — colour marks what needs attention, and nothing else. Not breaking: no
  address, width or height changes, so a v6.1.0 workbook still reads back.

  The sheet used to paint something on every cell it evaluated, including every cell that was fine —
  green at score 3-4, green on "Green", green on "Complete", green on any improvement. On a page read at
  a glance the eye should land on the gaps; it was landing on whatever had the most fill, which on a
  well-qualified deal is the good news.

  - **Three faint warm washes, named for the attention they ask for rather than for their hue.**
    `urgent` — nothing there: an unscored element, an untouched section, an overdue date, a "Red"
    rating. `warn` — barely begun, or a step backwards. `watch` — nearly there: partial, in progress, a
    score of 2. **Anything finished carries no fill at all.**
  - **The score column is a ladder now** — 0 red, 1 orange, 2 yellow, 3 and 4 clear — rather than three
    bands with the top one shouting. An element nobody has scored and one scored 1 are a gap and a
    start, and the old "under 2" rule painted them identically.
  - **A blank cell that something depends on is washed, at one of two levels.** `required` — a
    completion rule or the schema needs a value, so blank is a gap: an element's evidence, the three
    whys, the two strategy cells, the identifying metadata, a stakeholder's name, title and role.
    `wanted` — nothing requires it and a blank one is still worth seeing: a discovery question nobody has
    answered, which drops to the faintest tint. `qualStatus` is satisfied by any ONE answer, so calling
    the others missing would raise a false alarm on an element that is genuinely complete — and an
    unanswered question is still among the most actionable things on the sheet, so it drops a level
    rather than disappearing. Deliberately nothing at all on `notes` or the partner-side whys, which are
    legitimately empty. The level distinction came out of the second-opinion review.
  - **A row somebody has started is washed even if it was a spare one.** A list keeps blank rows below
    its entries so there is somewhere to type, and a conditional-format range does not grow when one is
    used — so a wash stopping at the last existing entry was absent from the case it is most use, a
    stakeholder halfway through being entered whose blank title is schema-required. Covering those rows
    unconditionally would ask for work nobody owes, so the rule carries the condition instead: empty
    **and** something else on this row, over the table's own columns rather than the width of the page,
    because two tables share a band of rows. Found by the second-opinion review.
  - **The Excel stage reads each rule's own resolved fill back out of the application** and checks it is
    warm and faint — red at least green at least blue, no channel far from white. That is the assertion
    that fails if green returns anywhere, and it is a property worth asserting where a hex is not.
  - The three `ragRed` / `ragAmber` / `ragGreen` **cell** styles are gone with it. Nothing had
    referenced them since the conditional formats took the colouring over.

- **`meddpicc`** v6.1.0 — the element definitions are back, as hover notes. Not breaking: no address
  moved, so a v6.0.0 workbook still reads back.

  They were a column until v6.0.0, and removing it is what let the tallest Qualification row drop from
  366pt to 111pt — the same eight paragraphs in every workbook, three grid columns wide, taken from a
  rep's own evidence and notes. But they were the only thing on the sheet telling somebody what "Paper
  Process" means. A note costs no width and no height, because it is not in the cell.

  - **Every element name carries its schema definition as a note.** Asserted the way the issue asked:
    the same spec with the note flag removed produces byte-identical row geometry, and the acceptance
    test asks *Excel* for the text on each of the eight cells and compares it against the schema — a
    note that does not survive the file being opened is worth nothing.
  - **A classic note is four parts that have to agree.** The text, a legacy VML drawing to position
    it, the worksheet's own relationships, and two content-type declarations; `legacyDrawing` goes
    last in the `CT_Worksheet` sequence, after the print group. Excel's response to any disagreement
    is to drop the note and open the file anyway, which is why the check is made through the
    application rather than by reading the package.
  - **Three guards, each for a silence.** A note on a cell a merge hides cannot be hovered at all; two
    notes on one cell lose one of them; a note with no text is a red triangle over nothing. The spec
    names a kind of note rather than a function, since it is JSON, and `check-spec` refuses both a
    kind nobody implemented and element definitions asked for on a table whose rows are not elements.

- **`meddpicc`** v6.0.0 — the sheet reads as designed rather than as whatever fitted. Breaking again,
  for the same reason as v5: addresses moved, so a workbook generated before this is refused on
  read-back. Regenerate.

  Opened side by side with the manual sheet, the palette and the grid matched — and the coloured
  labels staircased down the page. They were starting at **nine different columns** (B, F, G, H, I, J,
  L, M, N), because each row had been cut to fit its own content. Every row was individually sensible;
  together they looked like a mistake.

  - **Four slots, at B, F, J and N.** Every label starts on one and is exactly two columns wide; a
    value fills the rest of its slot, or runs on through the slots after it when they carry no label.
    So a row of four short pairs lines up with a row of two wide ones. `check-spec` enforces it, which
    is the part that keeps it true — the alignment is now a rule, not a tidy-up.
  - **The Qualification rows were three times taller than they needed to be.** Measured rather than
    guessed: Notes held up to 543 characters in the *narrowest* column on the sheet, 27.8 characters
    wide, wrapping to twenty lines. Widest content now gets the widest column, and the tallest row went
    from 366pt to 141pt — all eight elements fit on a screen where two and a half did.
  - **The per-element definition column is gone.** It was the same eight paragraphs in every workbook,
    taking three columns from a rep's own evidence. `engine hint <element>` still returns them, and the
    follow-up issue proposes putting them back as hover notes, which cost no height at all.
  - **The elements table shows the score and nothing a reader could work out.** Previous and Change were
    both on display — eight previous scores and eight deltas, two columns across the table so that
    somebody could see 3 beside 1 and be told the difference is 2. The score itself, colour-coded, is
    the at-a-glance signal; the arithmetic is not. Neither column is in the sample, incidentally: its
    177 cells mention no score, previous, change, rubric, evidence or notes at all. That width went to
    **Evidence and Notes**, which hold what a stakeholder actually reads out in a forecast call, and
    which were the narrowest columns on the sheet. Movement survives where it earns its place: one
    Previous Total and one Change on the scorecard, the Change coloured by its sign, and the total now
    computed by the engine since the column it used to sum is gone.
  - Two intermittent failures in the Excel acceptance test, both root-caused rather than retried away.
    A write can be silently discarded while Excel is still busy with the workbook, and a dependent
    formula is not calculated by the time the next question arrives — so writes are confirmed and
    dependent reads are polled, with a distinct message for each so the next failure names the right
    thing. The error-value detector reports the offending cell's address now, not just its sheet.

- **`meddpicc`** v5.0.0 — **the workbook is one laid-out deal-review sheet.** Breaking: the shape
  changed, so a workbook generated before this is refused on read-back. They are ephemeral —
  regenerate.

  Side by side with the manual sheet it was derived from, the old workbook did not present: a
  two-column list on eight tabs, one field per row, in a 78-character column with default row
  heights. This is a single dense page on the sample's own grid — sixteen content columns on a
  narrow gutter, banners spanning the width, labels in teal, questions beside answers, grids that
  read like grids — and it carries scores, evidence, notes and per-element definitions the sample
  does not.

  What that cost, and what it bought:

  - **No Excel Tables.** Stacked sections cannot share one set of column widths, so the sheet merges
    to get per-section widths — and Excel silently *drops* a table whose range contains a merged
    cell. The writer's table support is gone rather than left unused: a path the design forbids is an
    invitation, and the failure mode is quiet. Sort and filter go with it; keyed references,
    conditional formats and dropdowns are unaffected, because the formulas were always plain ranges.
  - **A list holds exactly the rows it shows.** Each is laid out with blank rows to spare, and
    content typed below them is refused by its cell address with what to do about it — add the entry
    to the deal JSON and regenerate. Reading downward is what the eight-tab version did, and on one
    sheet it would eventually append a section banner's own title as a stakeholder. Two real
    corruptions were found in that code on the way here: growth columns computed from the table's
    ordinal rather than the grid (`roleInDeal` read three columns from where it is written), and a
    downward scan bounded only by the last row in the file.
  - **Prose row heights are computed.** Excel autofits a wrapped cell but not a merged one, and
    nearly every prose cell is now merged, so `text-metrics.ts` measures each paragraph against its
    merged width and rounds up. It counts an East Asian character as two columns, which is what makes
    a Korean sheet possible later.
  - **An enum reads as words.** The Close Plan showed `pending` and `in_progress`; it now shows
    "Pending" and "In progress", offers those words in its dropdown, and translates them back on
    read. `labels.ts` owns all three directions and refuses a set whose labels collide, because
    read-back could not tell two identically-labelled values apart.
  - **Each table's geometry is published** in the plan and in `generate --plan`, so the acceptance
    test and the tests name a cell by table and column id instead of counting rows. Nothing on one
    sheet has a fixed address.

  The Excel acceptance test drives all of it against the real application, and now screenshots the
  sheet so the layout is judged by looking at it.

- **`meddpicc`** v4.3.1 — the Excel UAT can see the sheet, and its error-value check can fail.

  Everything the UAT asserted proved the workbook *computes*. Nothing could see it, and the current
  work is about how it looks: a column too narrow for its header, text clipped by a row height, a
  banner stopping short of the edge — all of these passed every assertion. So it now screenshots each
  sheet through `screencapture`, verifies every image, and prints where to look. No baselines are
  committed; comparing pixels across Excel versions, fonts and display scales is a tax that buys less
  than one honest look. The first look found two defects immediately: the "Must say yes" and "Can say
  no" headers are clipped, and booleans render as `TRUE`/`FALSE` where a deal review says Yes/No.

  Three things about `screencapture` that cost time, recorded so they need not again: it **exits 0
  when it fails to write the file**, so its exit code proves nothing; it **refuses any destination
  whose name begins with a dot**, which made a machine that captures perfectly well report having no
  Screen Recording permission; and images written under the run's temp directory are deleted by the
  script's own `rm -rf`, so every path it printed was already dead.

  **The error-value check had never been able to fail.** It claimed to scan every sheet for `#REF!`
  and friends and print "no Excel error values on any sheet". Two independent breakages, either
  sufficient: `repeat with ws in every worksheet of workbook "X"` raises "Parameter error. (-50)" when
  the collection is iterated, so `osascript` exited 1 with empty stdout and its stderr went to
  `/dev/null` — an empty result read as "no errors"; and an error cell read through `value as string`
  yields "missing value", never `#DIV/0!`, so the comparison could not have matched even had the loop
  worked. Measured with a planted `=1/0`: the old form reported `[]`, the new one reports
  `Deal:#DIV/0!`.

  Rather than fix it and ask to be trusted, the detector now **proves itself on every run** — clean,
  then with a deliberate `=1/0`, then clean again. An assertion nobody has watched fail is not an
  assertion.

  Review then found three problems in the new stage, one of them dangerous:

  - The screenshot directory was a fixed path cleared with `rm -rf` before use, so
    `MEDDPICC_UAT_SHOT_DIR=$HOME` would have recursively destroyed the operator's home directory —
    and it ran before the "screenshots disabled" check, so turning the stage off did not save you
    either. It now uses a fresh directory per run and **never deletes anything**. Verified by pointing
    it at a directory holding a file and a subdirectory and confirming both survived a full run. A
    second pass narrowed it further: the variable now names a **parent**, and each run gets a fresh
    subdirectory beneath it, because the permission probe still removed a file of its own chosen name
    inside the caller's directory and two runs shared output names there.
  - Captures paginated rows only and reset the scroll column to 1, so the right-hand columns of a wide
    sheet were never captured while the stage still reported PASS. The Qualification sheet's `Notes`
    column was invisible. Both axes are paginated now, and when the per-sheet cap bites it names what
    was left out instead of implying that was the whole sheet.
  - Pagination was measured from Excel's *current* visible range, before the window was resized to the
    capture rectangle. Measuring a window that is about to be made smaller overestimates how much
    fits, so the page count came out too low and the bottom of a sheet went uncaptured while the stage
    reported PASS. The window is placed first, then measured.
  - Verifying an image's dimensions says nothing about *what* is in it: `screencapture` records a
    screen rectangle, not a window. It now insists Excel is the frontmost application, and rejects a
    capture under 20 KB, since a blank or unpainted frame compresses to almost nothing while a
    spreadsheet screenshot is hundreds of kilobytes. Neither rules out a notification banner sitting
    on top of the sheet — that residual limit is worth knowing rather than papering over.
  - The refactor that made the detector self-verifying moved `fail` inside a command substitution,
    where it exits only the subshell — and this script runs `set -uo pipefail` with no `-e`, so the
    parent would have carried on with an empty result, which reads as "no errors found". Exactly the
    bug being fixed, reintroduced one level down. `error_values` now only ever returns text, and every
    decision about it is taken in the parent.

- **`meddpicc`** v4.3.0 — the workbook writer can lay a sheet out: merged ranges, a hidden grid, and
  a print setup.

  The generated workbook was functionally complete but presented as a data dump — a grid of cells
  with no heading that spanned anything. There was no way to express a banner, because the writer had
  no merge support at all.

  `SheetSpec` gains `merges`, `hideGridlines`, `zoom` and `print`. A merge is declared as a range and
  anchored by its top-left cell, and the writer fills every other covered cell with that cell's
  style — which is what Excel needs, because it paints a merged range from the styles of all its
  cells. Styling the anchor alone stops a banner's fill after its first column and leaves its border
  box open.

  Five things are refused rather than emitted for Excel to repair: a range that is malformed, one
  written bottom-right first, one covering a single cell, two that overlap, and one that would hide a
  value the caller wrote. The last is the one worth having — a merge silently swallowing a field is
  how two sections that overlap by a row look fine and lose data.

  The palette moves to the stock modern Office theme the manual sheet uses — `#0E2841` navy banners,
  `#156082` teal labels, `#0F9ED5` sub-headers — and two orphaned entries are gone. A new test binds
  each style name to the font and fill a person would actually see, so the positional-index mistake
  this writer has always been exposed to now fails loudly instead of quietly painting a banner in
  italic grey.

  Titles and section headers span the form width; table sheets declare no merges, because Excel drops
  a table whose range contains one. Every sheet hides the grid and prints landscape, one page wide,
  with the deal named in the header.

  Three more refusals came out of review. A range outside Excel's grid (`A0`, `XFE`, row 1048577) is
  well-formed and is not a cell. A merge overlapping an Excel table is worse than it sounds: Excel
  drops the table and repairs the file, so the sort button, the structured references and the
  auto-extend all vanish, leaving only a table count that fell to zero. And `A1:XFD1048576` is valid,
  in bounds and seventeen billion cells — without a cap the writer did not fail, it stopped
  responding.

  Chasing that last one turned up the real defect: cells were looked up by walking every row from
  inside the expansion loop, making the whole thing quadratic. A 200,000-cell merge did not finish in
  two minutes. Measured at the new cap, rescanning against indexing: `A1:B5000` 700ms against 9ms,
  `A1:A9999` 942ms against 7ms. The cap bounds the damage; the index makes it free.

  One more from a second review pass: Excel caps a print header at 255 characters and **drops** one
  that is longer rather than complaining, so a printout would come out unidentified while generation
  reported success. Nothing bounds a deal name, and the ampersand doubling grows the string on the way
  in — 200 ampersands encode to 400 characters. Measured: two 130-character names produced a
  269-character header. It is now truncated with an ellipsis, in whole encoded units so a cut can
  never split a `&&` pair and leave a dangling `&` to swallow what follows it.

  And truncating the *joined* string was not good enough either — a third pass caught that. The parts
  are ordered account-then-deal, so a 300-character account name consumed the whole budget and emitted
  a header with no deal name in it, which makes every deal for that account print identically.
  `PrintSetup.header` now takes parts and shares the budget across them, with a part that does not
  need its share releasing the surplus to the ones that do.

  The header also now carries `dealId`, and falls back to a constant when a deal names nothing at all.
  The schema requires `dealId`, `accountName` and `dealName` but bounds none of them, so all three can
  be empty strings and still validate — filed as #901, because that laxness reaches further than
  headers.

  Verified against real Excel: the file opens with no repair prompt, and Excel confirms the merge, the
  preserved anchor value, the absence of any merge inside a table range, the hidden grid, and the
  landscape fit-to-width setup.

  One UAT honesty fix came out of a real failure during that verification. The round-trip block wrote
  four cells, saved and closed in a single AppleScript, so when a save did not reach disk the reader
  saw the untouched file, found nothing to propose, and the script reported that
  `metadata.accountName` "came back as MISSING" — an accurate symptom pointing at the wrong component.
  The write is now checked in the open workbook, and the save is checked against the file on disk,
  each naming itself. Three consecutive runs, eight blocks each, green.

- **`meddpicc`** v4.2.0 — a row typed **under** a table is now read as a new list entry instead of
  merely being reported.

  An Excel Table extends the moment somebody types below its last row, which is simply how you add a
  stakeholder once the padded rows are used up. v2.7.0 reported those cells rather than dropping them
  — which was the honest minimum — but it still left the user to add the entry by hand.

  `planWorkbook` now returns `listGrowth` for every list-bound table: where its rows end, which list
  index comes next, and which columns are writable. The reader continues the same
  `list[index].field` shape `inputPathFor` builds, so a grown row goes through exactly the same
  coercion, schema check and append rule as a planned one — filling row 13 of a list holding four
  items is still refused for the holes it would leave.

  **A wholly blank row ends the scan.** Without that, a stray note a few rows under the table would
  be read as a stakeholder; with it, anything past the gap is still reported as content below the
  table, which is what it is.

  Only tables bound to a list can grow — `elements` and `elementResponses` have one row per element
  or question, so a row underneath them means something else entirely and is reported as before.

  `read` now also refuses a workbook spec that does not check out, as `generate` already did. Reading
  leans on the spec being well-formed: a column claiming both a formula and a `jsonPath` would have
  the reader take a computed value as somebody's answer, and `check-spec` already refuses that with
  the right words — "a derived value must not flow back". With one authority consulted on both
  paths, the reader no longer needs its own opinion about column roles.

  **Verified in real Excel**, because this is precisely the behaviour that cannot be simulated: the
  UAT now types a whole stakeholder into the row below the table, saves, and reads back three
  proposals under `stakeholders[12]`, applies them, and confirms 13 stakeholders in a deal that still
  validates. Two things that fixed themselves in the writing: filling only the name produced a deal
  that does not validate — a stakeholder needs a title and a role — and the UAT's own failure handler
  closed only the first workbook, so a mid-script failure left Excel holding a stale one and the next
  run read the Scorecard out of it and blamed the code. It now closes its own workbooks by name,
  waits until a known cell reads back before writing, and **verifies each write instead of discarding
  the AppleScript's errors** — which is what had made the round-trip block fail about one run in
  three. Three consecutive runs, seven blocks each, green.

  The review caught the dangerous version of that cleanup: my first fix closed *every* open workbook
  with `saving no`, which on the machine that runs this would have discarded unsaved changes in the
  operator's own spreadsheets. A test has no business touching a document it did not create, so it
  closes only the four names it ever produces, each wrapped so an absent one is a no-op. Verified by
  leaving an unrelated workbook open across a full run and confirming it survived.

- **`meddpicc`** v4.1.0 — `migrate` now settles the conflicts that were never actually ambiguous.

  v4.0.0 refused whenever a field was set under both its old and its new name, on the grounds that
  only a human knows which value is right. True for a genuine disagreement, needlessly obstructive
  for everything else — and everything else is the common case. The realistic conflict is a partial
  hand-edit: someone adds the new field and leaves the old one. Measured on the example deal, that
  case has **no ambiguous field at all** — two keys exist on one side only and the third is
  identical — and the previous version refused the whole subtree and made the user merge it by hand.

  The rule that makes settling it safe: **resolve only when the value being dropped carries no
  information the kept value lacks.**

  | case | resolution |
  | --- | --- |
  | the values are deep-equal | keep either — nothing is lost |
  | the legacy value is empty | keep the current one |
  | the current value is empty | move the legacy one across |
  | both are objects | merge key by key, recursing with these same rules |
  | both non-empty and different | still a **conflict**, still refused |

  `0` and `false` are not empty: a zero score and a "no" are answers, and treating them as absence
  would overwrite them with whatever the other side held. **Lists are never merged** — two non-empty
  team lists cannot be combined without inventing which entries are the same person and what order
  they belong in, so concatenating them would silently duplicate people.

  **Nothing is settled silently.** Every resolution is reported with its path and the reason it was
  safe, separately from plain renames, so an applied migration can be audited line by line. And
  merging stays atomic per field: if any leaf inside an object conflicts, neither side is touched
  and the conflicting leaf is named — a half-merged subtree would look migrated while burying the
  disagreement that stopped it.

  **Every value that moves is reported, and that is load-bearing.** Callers decide whether a deal
  needs migrating by asking whether anything was reported, so a settlement that changed the deal
  while saying nothing would tell them the file was already current — and its legacy values would go
  on being ignored. Reaching that failure from inside the code written to prevent it is exactly what
  happened during this change: `isEmpty` had also treated a recursively-blank object as empty, and
  mutation testing said that branch was unobservable, so I removed it. It was unobservable in the
  merged *values* and not in the *reports* — with `{}` now falling to the merge, a disjoint key was
  copied across with no line against it, and `validate` accepted the unmigrated file. Found by the
  review. Fixed at the root: every key taken from the legacy side is named, and a settled field
  always emits at least one line, so "a legacy key was removed" and "something was reported" cannot
  come apart.

- **`meddpicc`** v4.0.0 — **breaking: the plugin names no vendor.** MEDDPICC is an industry-standard
  framework and this repository is public, so the schema, the workbook and the skills no longer
  carry one company's names. `engine/cli.ts migrate <deal.json> --apply` moves an existing deal
  across.

  | was | is |
  | --- | --- |
  | `threeWhys.f5` / `whyF5` | `threeWhys.us` / `whyUs` |
  | `stakeholders[].viewOfF5` | `stakeholders[].sentiment` |
  | `stakeholders[].f5Owner` | `stakeholders[].relationshipOwner` |
  | `team.f5` | `team.internal` |
  | `metadata.revenue.pAndIplusAcvx` | `metadata.revenue.subscription` |

  `whyUs` is not only de-branded, it is more correct: "Why anything? Why us? Why now?" is the
  canonical Three Whys wording. The workbook labels follow — "Why us?", "Sentiment", "Relationship
  owner", "Internal team members", "Three Whys — Us", "Subscription" — and `skills/coach` no longer
  instructs the agent to tie its coaching to one company's product line.

  **The rename could not be made safely without a migration.** The schema sets
  `additionalProperties: false` nowhere, so a deal using the old names does not fail validation —
  it passes, while its values sit unreachable: present in the JSON, invisible to the workbook and
  to scoring. Silent data loss is a worse outcome than the branding it replaces. So `validate`,
  `generate` and `read` all **refuse** a deal that still uses the old names, listing them and
  naming the command that fixes it, and `migrate` reports what it would move before `--apply`
  writes anything — the same propose-then-apply posture as `read`.

  There is deliberately no separate detector: a deal has legacy fields exactly when `migrateDeal`
  reports changes or conflicts, so the check cannot drift from the transform that fixes it. Renames preserve
  each key's position too, so an applied migration reads as a rename rather than a rewrite.

  Two things worth knowing. `metadata.revenue.pAndIplusAcvx` turned out to be **an addend, not a
  total** — the workbook sums it with hardware and software — so the first generic name chosen for
  it, `totalContractValue`, would have been actively misleading; it is `subscription`. And a new
  guard test asserts that no schema field, label or instruction anywhere in the plugin names the
  vendor, excluding this repository's own URL. Its first version used `\bf5\b`, which matches none
  of `viewOfF5`, `whyF5` or `f5Owner` — camelCase leaves no word boundary — and would have passed a
  schema still full of them. Only the test's own self-check caught it.

  Renaming the input paths changes every workbook's stamp, so previously generated workbooks no
  longer read back. They are ephemeral by design: regenerate.

  Two findings from the review, both confirmed. **A field set under both names is now a conflict,
  not a decision the tool makes.** The first version deleted the legacy key so the migration would
  terminate — and for `threeWhys.f5`, which is an object, that discarded every answer inside it to
  make room for a possibly half-filled `threeWhys.us`. Silently dropping a value the user cannot
  see is the exact failure this migration exists to prevent, so `migrate` now reports both paths,
  writes nothing at all while a conflict stands, and leaves the choice to the person who made the
  edit. **And `next` and `score` refuse a legacy deal too**, not just `validate`: `next` drives the
  qualification workflow, and reading an unmigrated deal it found no `threeWhys.us` or
  `team.internal` and would have called two finished sections `not_started`, walking the user back
  through completed work without a word.

- **`meddpicc`** v3.0.0 — **breaking: `fill` is gone, and F5's Deal Review Sheet is no longer
  shipped.** One spreadsheet now, generated from `workbook-spec.json`, ephemeral by design:
  produced on demand and regenerated rather than kept.

  `meddpicc-template.xlsx` was F5's own internal Deal Review Sheet, carried here as a 91KB
  binary — in a **public** repository — so that `fill` could type values into its blank cells.
  We never designed that layout; we shipped a copy of someone else's document and filled it in.
  The curated template is `workbook-spec.json`, written by studying the F5 sheet to learn what
  belongs in a deal review, and it owes the original nothing at runtime.

  **It is out of the working tree, not out of the history.** `git rm` removes a file from HEAD;
  every earlier commit still carries it, and it stays fetchable from this public repository at
  91,251 bytes for as long as those commits exist. Nobody who clones today gets it, and no
  release ships it — but "deleted" and "unpublished" are different claims, and only the first is
  true here. Actually unpublishing it means rewriting history and force-pushing, which
  invalidates every clone and fork; that is a call for the repository's owner, not a side effect
  of a plugin change.

  Removed: `meddpicc-template.xlsx`, `cell-mapping.json`, `engine/fill.ts`, `engine/template.ts`,
  the `fill` command, and the `template`/`cellMapping` resource keys.

  **The Salesforce guard survives.** `check-mappings` validated two different mappings against
  the schema, and only one of them is going away — `sfdc-field-mapping.json` is still how the
  skill moves values to and from Salesforce, and a mistyped `schemaPath` there does not fail, it
  maps to nothing, so a field silently never syncs. It continues as **`check-sfdc`**, named for
  what it actually checks now.

  Stated plainly, because it is the cost of this change: there is no longer any way to produce a
  document that *looks like* the F5 Deal Review Sheet. Anyone who needs that exact artefact for
  an exec review fills it in by hand. The generated workbook is not a lookalike — it was designed
  from the schema and covers the same material plus the 0-4 scoring the F5 sheet had nowhere to
  put.

  `zip.test.ts` proved the verbatim-copy guarantee against the shipped template; it now proves it
  against a workbook we generate, which is a real multi-part deflated `.xlsx` and needs no
  fixture in the tree. The task-pane flow in the skill changes with it: it used to type cells
  into an open copy of the template, and now opens a generated workbook, because eight sheets
  with tables and formulas have to be created as a file rather than typed into whatever happens
  to be open.

- **`meddpicc`** v2.7.0 — the workbook reads back. `engine/cli.ts read <workbook.xlsx> --deal
  <deal.json>` reports what the spreadsheet proposes changing, and `--apply` writes it.

  **Read, diff, propose — never overwrite.** The JSON stays the source of truth, so a cell that
  differs is a *proposal*, printed with its old and new value. Nothing is written without
  `--apply`, and `--apply` writes only a deal that validates: a partly-applied file would be
  worse than none. The run's exit code follows the outcome, so a script can gate on it.

  **The reader walks `inputCells`**, the map `planWorkbook` already returns. It has no second
  idea of where a field lives, which is the only way the two directions cannot drift. `computed`
  and `derived` cells are outputs and are never read — including a formula found at an input
  address, which is refused rather than having the number beside it taken as somebody's answer.

  **Every rejection names its cell.** A score of 7, a status outside the enum, prose in a
  currency cell, `#REF!` in a text cell: each is reported as `Qualification!C8`, not as a JSON
  pointer, because the person who has to fix it is looking at Excel. Rejections never reach the
  deal, and the rest of the workbook still round-trips around them.

  **A workbook is read against the deal it came from, or not at all.** `generate` stamps each
  file with a fingerprint of the deal's identity and its layout, kept in a custom document
  property that Excel carries through a save; `read` refuses a workbook whose stamp does not
  match. This is not belt-and-braces. A table's row count depends on the deal, so answering one
  more question moves every Questions row below it, and reading a workbook from before that
  cell by cell produced **14 confident proposals — no rejections, `ok` true** — that wrote
  metrics' answers onto economicBuyer and economicBuyer's onto decisionCriteria. The stamp
  covers identity and layout only, never the whole deal, so a workbook already on someone's
  desk survives a JSON edit that moves no cell.

  **Nothing is dropped in silence.** The tables are padded with blank rows and an Excel Table
  extends further still when someone types under the last one — perfectly reasonable, and those
  cells belong to no field. They are now reported by address rather than passed over, because
  passing over them is the legacy sheet's own bug in a new place: it formatted eight team rows
  and dropped the rest.

  Five things that only look obvious afterwards, each of which would have made the reader
  useless in a different way:

  - **Excel rewrites the file when it saves.** The generator writes strings inline
    (`t="inlineStr"`); Excel re-saves the same text through `sharedStrings.xml` as `t="s"`.
    Measured: with shared strings unresolved, opening the workbook and saving it *without
    editing anything* produced 86 phantom proposals and 18 rejections. Every unit test passed.
  - **A date cell can only hold a day.** `2026-06-30T09:15:00Z` in the JSON against `2026-06-30`
    in the sheet is not an edit, so dates are compared as serials. Compared as text, the reader
    would have cried wolf on every read until nobody read it.
  - **An unscored element is written as `0`, not blank** — deliberately, since `COUNT` over
    blanks made a partly-qualified deal show 100%. So a `0` read back cannot be told from "not
    assessed", and a missing score must not become a proposal to set `score: 0`.
  - **A list may only be appended to.** The tables carry blank rows to grow into, and filling
    the sixth row of a three-item list would write `stakeholders[5]` into an array of length 3.
    Refused by cell address, with the row that is still empty named.

  Verified in real Excel end-to-end: four cells of four types edited by hand, saved, and read
  back exactly — a string through shared strings, a 0-4 score, `2026-09-15` typed as text and
  stored as a serial, and a boolean. The UAT was itself mutation-checked, and the 86-proposal
  measurement above is what it reports when the reader is broken.

  - **A refused write must change nothing.** Reaching `responses[1]` in a deal with no
    `responses` at all builds the array on the way to the leaf, and refusing the index
    afterwards left an empty array behind in a deal reported as unchanged. `writePath` now
    decides whether a write is possible before making it.

  `readPath` moved into `engine/json-path.ts` alongside the new `writePath`, so one walker
  serves both directions. The redundant integer check in the reader's coercion is gone: whether
  a whole number is required is the schema's call, and a second opinion could only disagree.

  The review found all three of the above independently of the two that were found while
  mutation-checking, and every one was reproduced before being fixed. Mutation testing was the
  more useful of the two passes on the reader's own guards: 24 deliberate breakages, all caught,
  and three of them changed the code rather than the tests — an error-cell test that proved
  nothing because it used a currency cell where `NaN` already rejected the value, an integer
  check duplicating the schema's, and a formula skip that was both untested and wrong.

- **`meddpicc`** v2.6.0 — the workbook is now a working spreadsheet, not just a rendered one.

  **Excel Tables** over all eight collections, so they filter, sort, stripe, and extend when
  someone types below the last row. This is what stops a collection being capped: the legacy
  sheet formatted eight team rows and dropped the rest.

  **Conditional formatting** from a curated set of named presets — `score` (0-1 red, 2 amber,
  3-4 green), `ragText`, `statusText` and `overdueDate`. `ragText` colours the rating *word*
  rather than re-deriving the engine's brackets from a percentage, so the colours cannot drift
  from `computeScore` by a rounding step.

  **Dropdowns read from the schema, never authored.** A column says `"validate": true` and the
  values come from that path's `enum` — or, for a bounded integer like a 0-4 score, from its
  `minimum`/`maximum`. Add a `roleInDeal` member to the schema and the dropdown gains it; there
  is no second list to remember. `check-spec` rejects `validate: true` on a path the schema
  does not constrain, since a dropdown offering nothing looks deliberate and is worse than
  none.

  Verified by asking Excel what it made of the file, not just whether it opened: 1 Table on
  Stakeholders, 3 conditional-format rules on the score column, and the role dropdown compared
  against the schema enum rather than a literal. Mutation-checked both ways — dropping
  `asTable` makes Excel report 0 tables, and hardcoding a dropdown list makes it disagree with
  the schema.

  `schemaConstraint` shares one walker with `resolveSchemaPath`, so a path the guard accepts is
  a path the generator can read constraints from. Two walkers would eventually disagree about
  `$ref` or `allOf`, silently.

  Two defects the review found, both reproduced in Excel before being fixed. **A keyed
  reference broke under sorting**: `asTable` hands the user a sort button, and
  `{{row:elements.score@champion}}` had resolved to `Qualification!C8` — champion's row only
  until someone sorted by score. Measured: after moving that row, the Scorecard went on
  reporting 3.0 (economicBuyer's score) under the Champion label. Keyed references are now
  `INDEX(range,MATCH("champion",keyRange,0))`, a table must declare its `keyColumn`, and
  `check-spec` refuses a `{{row:…}}` into a table that has not. **The Completion column was
  two-thirds uncoloured**: `computeCompletion` emits `not_started`/`partial`/`complete` while
  the `statusText` preset matches the closePlan enum `pending`/`in_progress`/`complete` — one
  shared word, two vocabularies. Added a `completionText` preset for the one it actually uses.

  No Reference sheet: inline validation lists made it redundant, and the 0-4 rubric text
  already sits on the Qualification row it describes.

- **`meddpicc`** v2.5.0 — the workbook generator. `engine/generate.ts` turns the spec plus a
  deal into a real `.xlsx`: `generate <deal.json> --out <file>`, or `--plan` to print where
  every input cell landed without writing anything.

  It resolves in two passes, because a formula's text depends on where other cells ended up.
  The first decides addresses, the second substitutes `{{ref:…}}`, `{{col:…}}`, `{{row:…}}`
  and `{{this:…}}` for them — so nothing in the spec names a coordinate and inserting a field
  cannot break a formula on another sheet. Dates are written as Excel serials rather than
  text, without which `closeDate - TODAY()` is a `#VALUE!` error.

  `planWorkbook` also returns `inputCells`: every cell holding a human's value, with the
  `jsonPath` it came from. That is the contract the round-trip reader will consume, so both
  directions are defined by one map.

  **Verified against real Excel, not just against our own writer.** `scripts/uat-generate-excel.sh`
  generates a workbook, opens it, reads the Scorecard back and compares it with what
  `engine score` computes by a completely different route: 21/32, 65.6%, Yellow from both, no
  error values on any sheet, no repair prompt. Mutation-checked — pointing one formula at the
  neighbouring column keeps `check-spec` green and the file valid, and the UAT catches it
  (Excel says 14, the engine says 21). It runs on request via `MEDDPICC_EXCEL_UAT=1`, since
  opening Excel takes over the foreground.

  Three defects the review found, all reproduced before being fixed. **A partly-qualified deal
  displayed as 100%**: `COUNT` ignores blank cells, so an unscored element shrank the
  denominator instead of counting as zero — one element at 4 and seven unscored showed 4/4
  beside a Red rating, where the engine said 12.5%. Score cells now write 0 when the deal has
  no score, matching `computeScore`, and the maximum counts the always-populated element
  column. `generate` now **validates the spec and the deal before writing**, so a mistyped
  `jsonPath` fails loudly instead of becoming an empty cell that reads as "not filled in yet".
  And `dateToSerial` **rejects impossible dates** rather than rolling them forward: it was
  turning `2026-02-31` into `2026-03-03`, a close date three days late that nothing downstream
  would question.

- **Plugin tests no longer depend on a real cloud CLI** (`aws` v1.2.2, `azure` v1.2.2,
  `gcloud` v1.2.2, `github` v1.2.2, `gitlab` v1.2.3, `salesforce` v1.3.3) — 32 tests across
  six plugins spawned `aws`, `az`, `gcloud`, `gh` or `sf`, because every tool factory built
  its executor from `ctx.cwd`. Whether they passed depended on which binaries the machine
  had and how fast they answered, which is how the CI job broke twice. All 27 factories now
  accept an injected executor, the validation suites use a stub, and the cases that
  genuinely drive a CLI are gated on its presence with an explicit timeout.

- `scripts/check-tests-are-hermetic.sh` proves it and keeps it that way: it replaces every
  cloud CLI with a sleeping stub, so a test that still spawns one trips bun's timeout and
  names itself. Wired into the Validate Plugins workflow.

Every plugin test suite now runs in CI, and the failures that surfaced are fixed.

- **Portable setup-wizard tests** (`aws` v1.2.1, `azure` v1.2.1, `gcloud` v1.2.1,
  `github` v1.2.1, `gitlab` v1.2.2, `salesforce` v1.3.2) — `runSetupWizard` resolved the
  install command from `process.platform` and shelled out to `which`, so the tests asserted
  `brew` and passed only on macOS. Each wizard now accepts an injected `detectPlatform`, and
  each suite covers macOS, Linux and a host with no package manager — the last of which was
  a live branch nobody asserted.

- **Tests no longer drive real cloud CLIs** (`salesforce` v1.3.2, `azure` v1.2.1) — a
  `sf_setup` validation test ran four genuine `sf config set target-org … --global`
  commands, writing to the developer's own `~/.sf/config.json`, and `az_exec` spawned `az`
  to check argument validation. Both tools take an injected executor now. The
  Salesforce extension-load suite genuinely needs the CLI and is skipped, visibly, when it
  is absent.

- **Stale plugin names** (`aws` v1.2.1, `azure` v1.2.1, `gcloud` v1.2.1,
  `salesforce-legacy` v1.0.1) — the suites asserted the pre-rename names
  (`aws-status`, `salesforce`) that nothing else in the repo still used, and azure's
  tool-factory list predated the rename that gave each file its verb.

- **Credential scanners no longer search `node_modules`** (12 plugins) — with dependencies
  installed, the scan reported five lines of `bun-types`' own npmrc documentation as
  hardcoded credentials. Six plugins already excluded it; the rest do now.

- **`salesforce-legacy` hook test** v1.0.1 — it symlinked `/usr/bin/bash`, which does not
  exist on macOS, so the scrubbed `PATH` held no usable shell and the hook never ran.

- **`meddpicc`** v2.4.1 — credential-scanner exclusion only.

- No plugin is exempt from the gate any more: `run-plugin-tests.sh` drops its `KNOWN_RED`
  list, since every named plugin is green.

- **`meddpicc`** bumped to v2.4.0 — foundations for a formula-driven workbook generated
  from the schema. Adds `engine/xlsx.ts`, an OOXML writer that emits a complete `.xlsx`
  from scratch with a fixed, named style palette, and `engine/workbook-spec.json`, a
  declarative description of the workbook that names a `jsonPath` for every input cell and
  writes formulas as symbolic references (`{{ref:acv}}`, `{{col:elements.score}}`) rather
  than addresses. `check-spec` validates the two against the deal schema: every input path
  resolves, all eight scored elements are captured exactly once, no two cells claim one
  value, every formula reference names something that exists, and side-by-side tables do
  not overlap. No output changes yet — `fill` is still what produces the report.

- **`meddpicc`** bumped to v2.3.0 — the deal review now fills the shipped F5 Deal
  Review Sheet template instead of a layout of its own: corrected `cell-mapping.json`
  (every scalar coordinate previously named the label cell, not the value cell),
  `fill` replaces `render`, and `check-mappings` now rejects a target that holds the
  template's own text. Adds `metadata.accountTeam`.

- **`meddpicc`** bumped to v2.2.1

- **`azure`** bumped to v1.2.0 — `az_exec` now accepts valid JMESPath `--query`
  (dropped the char filter that rejected `||`, backticks, and pipes); read-only guard,
  `az_help`, error taxonomy with `errorType`, and signal-aware exec. CLI-Plugin
  Capability Contract conformant.

- **`aws`** bumped to v1.2.0 — native tool layer: `aws_exec` read-only guard, `aws_help`,
  typed reads (`sts`/`s3`/`ec2`) with formatters, 6-class error taxonomy, JMESPath query
  docs, and a benchmark + autoresearch harness.

- **`gcloud`** bumped to v1.2.0 — native tool layer built from status-only: `gcloud_exec`
  read-only guard, `gcloud_help`, typed reads (config/projects/compute/storage) with
  formatters, error taxonomy, `--filter`/`--format` query docs, and a benchmark +
  autoresearch harness.

- **`gitlab`** bumped to v1.2.0 — `glab_exec` read-only guard + `glab_help`, error taxonomy
  with a central `errorType` wrapper, `--output json` query docs, signal-aware exec +
  control-char hygiene, adversarial guard hardening (pflag cluster and value-flag
  method-forgery fixes), and per-tool tests.

- **`github`** bumped to v1.2.0 — `gh_exec` read-only guard plus confirmed-mutation safety
  (`gh_pr_checkout`/`gh_pr_push` behind `ctx.ui.confirm` with a headless fail-safe),
  guard hardening (boolean-cluster verb-shift and value-flag method-forgery), and
  control-char hygiene enforced across every gh/git spawn.

- **`salesforce`** bumped to v1.3.0 — `sf_exec` read-only guard (colon-grammar normalize,
  `apex run` and api-body blocks) + `sf_help`, 6-class error taxonomy, adversarial guard
  hardening (pflag cluster and value-flag method-forgery fixes), and a `sf_pipeline_report`
  test.

- **f5xc-github-ops** bumped to v2.3.1 — rename `local status` to
  `local http_status` in the sourced `gh-poll.sh` and `retry.sh`
  libs so the agent's polling and backoff helpers no longer fail
  with "read-only variable: status" when the calling shell is Zsh

- **f5xc-firecrawl** added v1.1.0 — self-hosted Firecrawl web scraping plugin with
  7 commands (scrape, batch-scrape, crawl, map, search, extract, llmstxt), a
  `web-scraper` skill, and a `firecrawl-operator` agent; no API keys required,
  runs against the local Firecrawl instance on port 3002

- **f5xc-devcontainer** bumped to v1.1.4

- **f5xc-github-ops** bumped to v2.1.3

- **f5xc-github-ops** bumped to v2.1.2

- **f5xc-github-ops** bumped to v2.1.1

- **f5xc-sales-engineer** bumped to v1.0.4

- **f5xc-devcontainer** bumped to v1.1.3

- **f5xc-console** renamed to **f5xc-platform** v2.0.0 — now covers both web console UI automation and REST API management with separate agents for each domain

- **f5xc-console** bumped to v1.0.5

- **f5xc-console** bumped to v1.0.4

- **f5xc-console** bumped to v1.0.3

- **f5xc-console** bumped to v1.0.2

- **f5xc-console** bumped to v1.0.1

- **f5xc-meddpicc** bumped to v1.0.2

- **f5xc-meddpicc** bumped to v1.0.1

- **f5xc-sales-engineer** bumped to v1.0.3

- **f5xc-sales-engineer** bumped to v1.0.2

- **f5xc-sales-engineer** bumped to v1.0.1

- **f5xc-repo-governance** renamed to **f5xc-github-ops** v2.0.0 —
  functional name reflecting GitHub operations automation purpose

- **f5xc-repo-governance** bumped to v1.3.3

- **f5xc-repo-governance** bumped to v1.3.2

- **f5xc-repo-governance** bumped to v1.3.1

## [1.0.0] - 2025-06-01

### Added

- **f5xc-docs-tools** plugin (v1.0.0) — MDX content
  validation skill with seven checks and `/review-mdx`
  command
- **f5xc-sales-engineer** plugin (v1.0.0) — Sales Engineer
  persona framework with four skills (sales-engineer,
  demo-executor, presenter, subject-matter-expert) and two
  agents (demo-housekeeping, demo-researcher)
- Marketplace manifest at `.xcsh-plugin/marketplace.json`
- Documentation site with plugin catalog, getting started
  guide, reference, and contributing guide
- Plugin validation CI workflow
