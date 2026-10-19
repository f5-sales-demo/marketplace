# Salesforce interactive guidance acceptance

Delivery: [#1633](https://github.com/f5-sales-demo/marketplace/issues/1633).
Parent gates: [#1591](https://github.com/f5-sales-demo/marketplace/issues/1591)
and [#1624](https://github.com/f5-sales-demo/marketplace/issues/1624).

## Shipped guidance workflow

The corporate MDM MacBook ran published xcsh 23.9.0 with installed Salesforce
2.3.13, source `d13babf0909a87982f1ff9d43abe8d1ab8a41f2e`.
The native interactive launch disabled memories, LSP and other extensions,
loaded the installed plugin and a private lifecycle observer, and restricted
execution to `read,sf_org_display`. The model read the shipped
`agents/cli-operator.md`, selected native `sf_org_display`, and completed with
successful connected/read-only status. The observer recorded successful read
and tool results, followed by `agent_end`; `hasUI` was true.

This qualifies direct use of the optional-agent guidance and its useful default
org-status example. It does not establish a delegated agent launch. The shipped
content and source regression evidence remain in the
[2.3.13 source and installed receipt](salesforce-surface-completion-20261018.md).
The complete six-tool fixture/service matrices in that receipt remain separate.

Four individually inspected private ANSI captures cover 153 columns, Nerd
symbols, both themes and collapsed/expanded tools. Every capture retained
successful connected/read-only status. Native theme switches succeeded;
expansion was enabled and observed. This scoped case does not qualify the
40/76/120/153 layout matrix, three-preset switching, independent failure
outcomes, long-result pagination or desktop-font raster fidelity.

| Capture | SHA256 |
| --- | --- |
| Dark collapsed | `9540aad43edfc8ac244b7a2897f28967dd10b20b435b1e390c1e277e1f002cc4` |
| Light collapsed | `cd67ac5346650b2f176cd054305de345aebd4856386aa6b02cf13342aab39ad4` |
| Light expanded | `ef938eeb87c181ba0db18c936a08fb7936e612541488226fa1588485bd491441` |
| Dark expanded | `d64dd4da20d704714fe2184a1223e4cd01033cd1af11ff1389dddab27eafb5b5` |

Raw captures and the session remain private in the
`salesforce-2.3.13-completion-20261018/interactive-org` cohort. The Herdr prompt
admission waiter stalled despite the completed model turn; its diagnostic is
retained and does not establish a product failure. No Salesforce writes,
authentication repair or service probes on Ubuntu/NUC were performed.

## Historical 23.9.0 interactive shutdown prerequisite

The private `/salesforce-acceptance-exit` command called documented
`ctx.shutdown()` in the published 23.9.0 interactive runtime. It did not exit or
emit `session_shutdown`. Ctrl+D then exited normally and emitted that event with
`hasUI: true`. The owned pane was retired; the root agent pane was preserved.

Runtime repair [xcsh #5022](https://github.com/f5-sales-demo/xcsh/issues/5022)
tracks this independently. Next action: merge the tested runtime repair, verify
the first stable immutable artifact containing it, install it on the corporate
MacBook and repeat the actual TUI command before claiming installed shutdown
acceptance. Historical 23.9.0 failure and successful Ctrl+D evidence remain
separate. Keep the parent Salesforce issues open.

## Published 23.9.1 shutdown qualification

The first stable installed runtime repair passed both idle and active-pipeline
shutdown in the actual interactive TUI on the corporate MacBook.
The active run aborted, ended with zero active executions, emitted shutdown
and exited with code zero in 13 ms; zero late updates were observed.
The [23.9.1 acceptance receipt](salesforce-installed-2391-20261019.md)
records immutable artifact, installed fixture and shutdown evidence separately.
This closes the historical shutdown prerequisite for that exact cohort.
Later presentation changes require fresh installed acceptance.
