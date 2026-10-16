// Public synthetic records only; these never read an authenticated CLI or user profile.
export const taskQuery = 'SELECT Subject, Status, ActivityDate FROM Task ORDER BY ActivityDate LIMIT 10';
export const taskRecords = Array.from({ length: 10 }, (_, i) => ({
  attributes: { type: 'Task' },
  Id: `synthetic-task-${i}`,
  Subject: `Prepare demo ${i}`,
  Status: i === 0 ? 'Not Started' : i === 1 ? 'In Progress' : 'Completed',
  ActivityDate: '2026-10-20',
}));
export const aggregateQuery = 'SELECT COUNT(Id) opportunityCount, SUM(Amount) reportedAmount FROM Opportunity';
export const aggregateRecord = {
  attributes: { type: 'AggregateResult' },
  opportunityCount: 1234,
  reportedAmount: '9876543.2100',
};
export const eventSchema = {
  name: 'Event',
  label: 'Event',
  fields: [
    { name: 'Subject', label: 'Subject', type: 'string', custom: false, filterable: true, groupable: true },
    { name: 'StartDateTime', label: 'Start', type: 'datetime', custom: false, filterable: true, groupable: true },
    { name: 'Description', label: 'Description', type: 'textarea', custom: false, filterable: false, groupable: false },
    ...Array.from({ length: 17 }, (_, i) => ({
      name: `Synthetic${i}__c`,
      label: `Synthetic ${i}`,
      type: 'picklist',
      custom: true,
      filterable: true,
      groupable: false,
      referenceTo: ['Contact'],
      picklistValues: [
        { value: 'First', active: true },
        { value: 'FINAL_PICKLIST', active: true },
        { value: 'INACTIVE_EVIDENCE', active: false },
      ],
    })),
  ],
  childRelationships: Array.from({ length: 3 }, (_, i) => ({
    childSObject: `SyntheticChild${i}`,
    relationshipName: `SyntheticChildren${i}`,
    field: 'EventId',
  })),
};
export const queryHelp =
  'Execute a SOQL query.\n\nUSAGE\n  $ sf data query -q <value>\n\nFLAGS\n  -q, --query=<value>  (required) SOQL to execute\n  -o, --target-org=<value>  Org alias\n\nEXAMPLES\n  $ sf data query -q "SELECT Id FROM Task"\n\nUNFAMILIAR SECTION\n  FINAL_HELP_EVIDENCE';
