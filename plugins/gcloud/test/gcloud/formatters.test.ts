import { describe, expect, it } from 'bun:test';
import {
  basename,
  formatBucketTable,
  formatConfigDetail,
  formatInstanceTable,
  formatProjectTable,
  normalizeBucket,
  normalizeBuckets,
  normalizeConfig,
  normalizeInstance,
  normalizeInstances,
  normalizeProject,
  normalizeProjects,
} from '../../src/gcloud/formatters';

// ---------------------------------------------------------------------------
// basename helper
// ---------------------------------------------------------------------------

describe('basename', () => {
  it('returns the last path segment of a URL', () => {
    expect(basename('https://www.googleapis.com/compute/v1/projects/p/zones/us-central1-a')).toBe('us-central1-a');
  });

  it('returns the input unchanged when there is no slash', () => {
    expect(basename('us-central1-a')).toBe('us-central1-a');
  });

  it('returns empty string for empty input', () => {
    expect(basename('')).toBe('');
  });
});

// ---------------------------------------------------------------------------
// Normalizers
// ---------------------------------------------------------------------------

describe('normalizeConfig', () => {
  it('maps nested core/compute config into a flat struct', () => {
    const config = normalizeConfig({
      core: { project: 'my-project', account: 'me@example.com' },
      compute: { region: 'us-central1', zone: 'us-central1-a' },
    });
    expect(config).toEqual({
      project: 'my-project',
      account: 'me@example.com',
      region: 'us-central1',
      zone: 'us-central1-a',
    });
  });

  it('defaults missing sections to empty strings', () => {
    expect(normalizeConfig({})).toEqual({ project: '', account: '', region: '', zone: '' });
  });
});

describe('normalizeProject', () => {
  it('maps project fields', () => {
    expect(
      normalizeProject({
        projectId: 'my-project',
        name: 'My Project',
        projectNumber: '123456789',
        lifecycleState: 'ACTIVE',
      }),
    ).toEqual({
      projectId: 'my-project',
      name: 'My Project',
      projectNumber: '123456789',
      lifecycleState: 'ACTIVE',
    });
  });

  it('defaults missing fields to empty strings', () => {
    expect(normalizeProject({})).toEqual({ projectId: '', name: '', projectNumber: '', lifecycleState: '' });
  });
});

describe('normalizeInstance', () => {
  it('takes URL basenames for zone/machineType and extracts nested IPs', () => {
    const inst = normalizeInstance({
      name: 'vm-1',
      zone: 'https://www.googleapis.com/compute/v1/projects/p/zones/us-central1-a',
      machineType: 'https://www.googleapis.com/compute/v1/projects/p/zones/us-central1-a/machineTypes/e2-medium',
      status: 'RUNNING',
      networkInterfaces: [{ networkIP: '10.0.0.2', accessConfigs: [{ natIP: '34.1.2.3' }] }],
    });
    expect(inst).toEqual({
      name: 'vm-1',
      zone: 'us-central1-a',
      machineType: 'e2-medium',
      status: 'RUNNING',
      internalIp: '10.0.0.2',
      externalIp: '34.1.2.3',
    });
  });

  it('defaults missing network interfaces to empty IPs', () => {
    const inst = normalizeInstance({ name: 'vm-2', zone: 'us-central1-b', machineType: 'e2-small', status: 'STOPPED' });
    expect(inst).toEqual({
      name: 'vm-2',
      zone: 'us-central1-b',
      machineType: 'e2-small',
      status: 'STOPPED',
      internalIp: '',
      externalIp: '',
    });
  });
});

describe('normalizeBucket', () => {
  it('maps camelCase fields', () => {
    expect(
      normalizeBucket({
        name: 'my-bucket',
        location: 'US',
        storageClass: 'STANDARD',
        timeCreated: '2021-01-01T00:00:00Z',
      }),
    ).toEqual({ name: 'my-bucket', location: 'US', storageClass: 'STANDARD', created: '2021-01-01T00:00:00Z' });
  });

  it('falls back to snake_case field variants', () => {
    expect(
      normalizeBucket({
        name: 'my-bucket',
        location: 'EU',
        storage_class: 'NEARLINE',
        creation_time: '2022-02-02T00:00:00Z',
      }),
    ).toEqual({ name: 'my-bucket', location: 'EU', storageClass: 'NEARLINE', created: '2022-02-02T00:00:00Z' });
  });
});

describe('list normalizers', () => {
  it('normalizeProjects maps over the array', () => {
    const projects = normalizeProjects([
      { projectId: 'a', name: 'A', projectNumber: '1', lifecycleState: 'ACTIVE' },
      { projectId: 'b', name: 'B', projectNumber: '2', lifecycleState: 'DELETE_REQUESTED' },
    ]);
    expect(projects).toHaveLength(2);
    expect(projects[0].projectId).toBe('a');
    expect(projects[1].lifecycleState).toBe('DELETE_REQUESTED');
  });

  it('normalizeInstances maps over the array', () => {
    const instances = normalizeInstances([
      { name: 'vm-1', zone: 'z/us-central1-a', machineType: 'm/e2-medium', status: 'RUNNING' },
    ]);
    expect(instances).toHaveLength(1);
    expect(instances[0].zone).toBe('us-central1-a');
    expect(instances[0].machineType).toBe('e2-medium');
  });

  it('normalizeBuckets maps over the array', () => {
    const buckets = normalizeBuckets([{ name: 'b1', location: 'US', storage_class: 'STANDARD', creation_time: 't' }]);
    expect(buckets).toHaveLength(1);
    expect(buckets[0].storageClass).toBe('STANDARD');
  });
});

// ---------------------------------------------------------------------------
// Formatters
// ---------------------------------------------------------------------------

describe('formatConfigDetail', () => {
  it('renders all fields', () => {
    const out = formatConfigDetail({
      project: 'my-project',
      account: 'me@example.com',
      region: 'us-central1',
      zone: 'us-central1-a',
    });
    expect(out).toBe(
      [
        '**Project:** my-project',
        '**Account:** me@example.com',
        '**Region:** us-central1',
        '**Zone:** us-central1-a',
      ].join('\n'),
    );
  });

  it('renders - for missing fields', () => {
    const out = formatConfigDetail({ project: '', account: '', region: '', zone: '' });
    expect(out).toBe(['**Project:** -', '**Account:** -', '**Region:** -', '**Zone:** -'].join('\n'));
  });
});

describe('formatProjectTable', () => {
  it('returns empty state when list is empty', () => {
    expect(formatProjectTable([])).toBe('No projects found.');
  });

  it('renders header, separator and rows', () => {
    const out = formatProjectTable([
      { projectId: 'a', name: 'A', projectNumber: '1', lifecycleState: 'ACTIVE' },
      { projectId: 'b', name: '', projectNumber: '2', lifecycleState: 'ACTIVE' },
    ]);
    const lines = out.split('\n');
    expect(lines[0]).toBe('| Project ID | Name | Number | State |');
    expect(lines[1]).toBe('|------------|------|--------|-------|');
    expect(lines[2]).toBe('| a | A | 1 | ACTIVE |');
    expect(lines[3]).toBe('| b | - | 2 | ACTIVE |');
  });
});

describe('formatInstanceTable', () => {
  it('returns empty state when list is empty', () => {
    expect(formatInstanceTable([])).toBe('No instances found.');
  });

  it('renders header, separator and rows with - for empty IPs', () => {
    const out = formatInstanceTable([
      {
        name: 'vm-1',
        zone: 'us-central1-a',
        machineType: 'e2-medium',
        status: 'RUNNING',
        internalIp: '10.0.0.2',
        externalIp: '34.1.2.3',
      },
      {
        name: 'vm-2',
        zone: 'us-central1-b',
        machineType: 'e2-small',
        status: 'STOPPED',
        internalIp: '',
        externalIp: '',
      },
    ]);
    const lines = out.split('\n');
    expect(lines[0]).toBe('| Name | Zone | Machine Type | Status | Internal IP | External IP |');
    expect(lines[1]).toBe('|------|------|--------------|--------|-------------|-------------|');
    expect(lines[2]).toBe('| vm-1 | us-central1-a | e2-medium | RUNNING | 10.0.0.2 | 34.1.2.3 |');
    expect(lines[3]).toBe('| vm-2 | us-central1-b | e2-small | STOPPED | - | - |');
  });
});

describe('formatBucketTable', () => {
  it('returns empty state when list is empty', () => {
    expect(formatBucketTable([])).toBe('No buckets found.');
  });

  it('renders header, separator and rows', () => {
    const out = formatBucketTable([
      { name: 'b1', location: 'US', storageClass: 'STANDARD', created: '2021-01-01T00:00:00Z' },
      { name: 'b2', location: 'EU', storageClass: 'NEARLINE', created: '' },
    ]);
    const lines = out.split('\n');
    expect(lines[0]).toBe('| Name | Location | Storage Class | Created |');
    expect(lines[1]).toBe('|------|----------|---------------|---------|');
    expect(lines[2]).toBe('| b1 | US | STANDARD | 2021-01-01T00:00:00Z |');
    expect(lines[3]).toBe('| b2 | EU | NEARLINE | - |');
  });
});
