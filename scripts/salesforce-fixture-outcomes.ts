// Injected only into the private synthetic CLI; never loaded by the installed plugin.
const scenarioPath = process.env.PRESENTATION_FIXTURE_CONTROL;
const scenario = scenarioPath && (await Bun.file(scenarioPath).exists()) ? await Bun.file(scenarioPath).json() : {};
const outcome = scenario.outcome;
const fixtureQuery = args[args.indexOf('--query') + 1] ?? '';
// Empty reports still require verified identity, schema and fiscal-period prerequisites.
const prerequisite =
  scenario.tool === 'sf_pipeline_report' &&
  outcome === 'empty' &&
  (args[0] !== 'data' || /FROM (?:Period|User)\b/.test(fixtureQuery));
if (outcome && !prerequisite) {
  const tool = scenario.tool;
  if (!['empty', 'unavailable', 'partial', 'failed'].includes(outcome ?? ''))
    throw new Error('Unknown synthetic outcome');
  const send = (result: unknown, warnings: string[] = []) => {
    console.log(JSON.stringify({ status: 0, result, warnings }));
    process.exit(0);
  };
  if (outcome === 'unavailable' || outcome === 'failed') {
    const message =
      outcome === 'unavailable'
        ? 'Synthetic service unavailable. Select an authenticated target_org or review xcsh plugin setup salesforce.'
        : 'Synthetic command failed. Run sf help for supported arguments and retry the read-only command.';
    if (args.includes('--help')) console.log(message);
    else console.log(JSON.stringify({ status: 1, name: 'SyntheticCaptureError', message }));
    process.exit(1);
  }
  if (tool === 'sf_help') {
    if (outcome === 'partial')
      console.log('Synthetic partial help: output truncated. Run sf help data query for complete guidance.');
    process.exit(0);
  }
  if (tool === 'sf_exec' && outcome === 'empty') process.exit(0);
  if (tool === 'sf_describe')
    send(
      { name: 'Opportunity', fields: [] },
      outcome === 'partial'
        ? ['Synthetic partial catalog. Rerun sf sobject describe for the complete field catalog.']
        : [],
    );
  if (tool === 'sf_org_display')
    send(
      outcome === 'empty'
        ? {}
        : {
            username: 'synthetic@example.com',
            instanceUrl: 'https://salesforce.example.com',
          },
      outcome === 'partial'
        ? ['Synthetic partial identity. Rerun sf org display to retrieve optional identity fields.']
        : [],
    );
  if (outcome === 'empty') send({ records: [], totalSize: 0, done: true });
  if (outcome === 'partial')
    send({
      records: [{ Name: 'Synthetic partial record', Amount: 0, CurrencyIsoCode: 'CAD', IsClosed: false }],
      totalSize: 2,
      done: false,
    });
}
