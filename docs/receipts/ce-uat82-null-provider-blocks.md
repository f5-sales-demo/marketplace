# CE UAT82 null provider blocks

Fresh archive-installed UAT80 public discovery and planning passed. Terraform created the owned AWS network foundation and submitted the F5 site POST, then reconciliation failed with `Required provider input is null: admin_user_credentials`. Bootstrap and registration were not qualified.

Public teardown preparation also failed complete unregistered absence; the owned fixture and failure receipts remain retained.

The live site response contains eight null optional messages. The exact installed provider schema identifies them as optional blocks. The renderer now omits null optional blocks, which Terraform represents as absent.

It retains rejection of required blocks, required attributes, unknown fields and computed-only attributes. Optional writable attributes may remain null. No credentials or synthetic empty blocks are generated.

Regressions fail before repair and pass afterward. Live reconciliation and independent cleanup require execution from exact UAT82 archives. All four plugins advance together to UAT82. The UAT80 live failure remains failed; source verification cannot substitute for its missing live acceptance.

Full UAT, the original interface control/freshness and transition, the failed 45000 ms restoration criterion, producer qualification/publication, fleet convergence and explicit acceptance remain open. PR1565 stays draft with auto-merge disabled.
