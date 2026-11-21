export function upgradeSiteFixture() {
  return {
    metadata: { name: 'ce-one', namespace: 'system' },
    system_metadata: { uid: 'physical-one' },
    spec: { main_nodes: [{ name: 'node-one' }], site_state: 'ONLINE' },
    status: [
      { volterra_software_status: null },
      {
        metadata: {
          uid: 'software-publisher',
          creator_class: 'maurice',
          status_id: 'software-version',
          publish: 'STATUS_PUBLISH',
          vtrp_stale: false,
        },
        volterra_software_status: {
          last_installed_version: 'crt-20260201-0178',
          available_version: 'crt-20260201-0179',
          deployment_state: { version: 'crt-20260201-0178', phase: 'UPGRADE_COMPLETED', result: 'Completed' },
        },
      },
      {
        metadata: {
          uid: 'os-publisher',
          creator_class: 'maurice',
          status_id: 'operating-system-version',
          publish: 'STATUS_PUBLISH',
          vtrp_stale: false,
        },
        operating_system_status: {
          available_version: '9.2026.17',
          deployment_state: { version: '9.2026.14', phase: 'UPGRADE_COMPLETED', result: 'success' },
        },
      },
    ],
  };
}
