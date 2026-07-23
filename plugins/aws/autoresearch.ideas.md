# Autoresearch Ideas — AWS Plugin

## Prompt Optimization

- [ ] Compress tool descriptions: keep flag names, parameter types, and one-line summaries; drop prose
- [ ] Add inline `--output json` field examples to aws_s3_ls and aws_ec2_describe_instances prompts (reduces aws_help round-trips)
- [ ] Reinforce the `aws <service> <operation> help` contrast (help subcommand, not a `--help` flag) where the model is most likely to guess wrong
- [ ] Cross-tool hints: "use aws_help to discover flags before aws_exec"
- [ ] Clarify when to prefer typed tools over aws_exec so the model does not reach for the passthrough first

## Error Handling

- [ ] Map more aws stderr signatures in src/aws/exec.ts to typed errors (auth, session-expired, throttling, access-denied, not-found)
- [ ] Include the fix command in "not authenticated" errors (run: `aws sso login` or `aws configure`)
- [ ] Add structured retry hints to error results (e.g. retry_with: aws_sts_whoami)

## Formatter Improvements

- [ ] Shorten column labels in the instance summary table without losing meaning
- [ ] Consistent "no results" messaging across formatBucketTable, formatInstanceTable, and formatS3ObjectTable
- [ ] Trim redundant whitespace emitted by the identity detail formatter

## Token Efficiency

- [ ] Audit the per-file prompt byte budget across the 5 prompts; target the largest first
- [ ] Merge near-duplicate guidance shared by aws_s3_ls and aws_ec2_describe_instances prompts
- [ ] Remove markdown that adds tokens without improving model parsing (horizontal rules, extra headings)

## Guardrail Coverage

- [ ] Extend benchmark scenarios for aws_exec: `s3 sync` block, `--region`-shifted operation block
- [ ] Add an s3 object listing scenario driven by a text `s3 ls s3://bucket/prefix` fixture
- [ ] Keep the read-only allowlist fail-safe: new read verbs are opt-in, never a blanket allow
