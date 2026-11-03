# GCP native sizing and tool contract repair

Issue: <https://github.com/f5-sales-demo/marketplace/issues/1559>. Draft PR:
<https://github.com/f5-sales-demo/marketplace/pull/1698>.

Attempt 324 repairs native resize planning that accepted non-finite or fractional original
NIC counts. Failing-first coverage now rejects these values before constructing any action.
The planner remains nonexecutable until its operation-specific admission and live gates pass.

The broader check also exposed pre-existing GCloud tool contract errors. The plugin now uses
the real TypeBox builder type, preserves optional error flags in its declared replies and retains
arbitrary safe lifecycle details in the result type. Tests use the actual schema builder and
explicitly narrow optional records, readonly sections and variant resources. Validation still
uses injected CLI stubs and does not access real cloud services. Runtime behavior is unchanged.

Twenty-four focused lifecycle tests passed with 79 assertions. The full GCloud suite passed
487 tests with 1,780 assertions; fourteen shared runtime and tracker tests passed with 518
assertions. Runtime builds passed. GCloud manifests, package and catalog are version 1.7.26.
Supported tracker reconciliation preserves historical evidence, receipts and retirements.

The full direct TypeScript check now reports zero GCloud source or test diagnostics. It still
reports 29 diagnostics in the installed xcsh SDK dependency, including missing declarations,
optional/generated assets and DOM or socket type incompatibilities. This broader check remains
unmet. The SDK repair and qualification are required work; these diagnostics are not suppressed
or treated as a passing check. Historical dependency installations remain preserved.

A Node buffer cap terminated a read-only Git child while reviewing the large tracker. That
failed helper is retained as unqualified evidence. A file-backed read replaced it, avoiding
the buffer-triggered termination. The original child identity was not captured, so this receipt
does not invent an independent closure claim for that helper.

Source, runtime, SDK qualification, live GCP operation acceptance and publication remain
separate. The PR stays draft, full issue acceptance remains incomplete and immutable v12.3.1
assets are unchanged.
