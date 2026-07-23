import { describe, expect, it } from 'bun:test';
import {
  formatBucketTable,
  formatIdentityDetail,
  formatInstanceTable,
  formatS3ObjectTable,
  normalizeBucket,
  normalizeIdentity,
  normalizeInstance,
  normalizeReservations,
  parseS3LsOutput,
} from '../../src/aws/formatters';
import type { AwsBucket, AwsEc2Instance, AwsS3Object } from '../../src/aws/types';

describe('normalizeIdentity', () => {
  it('maps sts get-caller-identity JSON', () => {
    const id = normalizeIdentity({
      Account: '123456789012',
      Arn: 'arn:aws:iam::123456789012:user/alice',
      UserId: 'AIDAEXAMPLE',
    });
    expect(id).toEqual({
      Account: '123456789012',
      Arn: 'arn:aws:iam::123456789012:user/alice',
      UserId: 'AIDAEXAMPLE',
    });
  });

  it('defaults missing fields to empty strings', () => {
    expect(normalizeIdentity({})).toEqual({ Account: '', Arn: '', UserId: '' });
  });
});

describe('normalizeBucket', () => {
  it('maps s3api list-buckets entry', () => {
    expect(normalizeBucket({ Name: 'my-bucket', CreationDate: '2021-01-01T00:00:00Z' })).toEqual({
      name: 'my-bucket',
      creationDate: '2021-01-01T00:00:00Z',
    });
  });
});

describe('normalizeInstance', () => {
  it('extracts name tag, state, placement and IPs', () => {
    const inst = normalizeInstance({
      InstanceId: 'i-0123456789abcdef0',
      InstanceType: 't3.micro',
      State: { Name: 'running' },
      Placement: { AvailabilityZone: 'us-east-1a' },
      PrivateIpAddress: '10.0.0.5',
      PublicIpAddress: '54.1.2.3',
      Tags: [
        { Key: 'Name', Value: 'web-1' },
        { Key: 'env', Value: 'prod' },
      ],
    });
    expect(inst).toEqual({
      instanceId: 'i-0123456789abcdef0',
      state: 'running',
      type: 't3.micro',
      az: 'us-east-1a',
      privateIp: '10.0.0.5',
      publicIp: '54.1.2.3',
      name: 'web-1',
    });
  });

  it('handles missing tags and public IP', () => {
    const inst = normalizeInstance({
      InstanceId: 'i-000',
      InstanceType: 't2.nano',
      State: { Name: 'stopped' },
      Placement: { AvailabilityZone: 'eu-west-1b' },
      PrivateIpAddress: '10.0.0.9',
    });
    expect(inst.name).toBe('');
    expect(inst.publicIp).toBe('');
    expect(inst.state).toBe('stopped');
  });
});

describe('normalizeReservations', () => {
  it('flattens Reservations[].Instances[]', () => {
    const instances = normalizeReservations({
      Reservations: [
        { Instances: [{ InstanceId: 'i-1', State: { Name: 'running' } }] },
        { Instances: [{ InstanceId: 'i-2', State: { Name: 'stopped' } }, { InstanceId: 'i-3' }] },
      ],
    });
    expect(instances.map((i) => i.instanceId)).toEqual(['i-1', 'i-2', 'i-3']);
  });

  it('returns empty array when no reservations', () => {
    expect(normalizeReservations({})).toEqual([]);
  });
});

describe('parseS3LsOutput', () => {
  it('parses object and prefix lines', () => {
    const raw = [
      '                           PRE logs/',
      '2021-01-01 12:00:00       1234 file.txt',
      '2021-06-15 08:30:59         42 dir/nested.json',
      '',
    ].join('\n');
    const objects = parseS3LsOutput(raw);
    expect(objects).toEqual([
      { key: 'logs/', size: 0, lastModified: '' },
      { key: 'file.txt', size: 1234, lastModified: '2021-01-01 12:00:00' },
      { key: 'dir/nested.json', size: 42, lastModified: '2021-06-15 08:30:59' },
    ]);
  });

  it('returns empty array for empty output', () => {
    expect(parseS3LsOutput('')).toEqual([]);
  });
});

describe('formatIdentityDetail', () => {
  it('renders account, arn and user id', () => {
    const out = formatIdentityDetail({
      Account: '123456789012',
      Arn: 'arn:aws:iam::123456789012:user/alice',
      UserId: 'AIDAEXAMPLE',
    });
    expect(out).toContain('123456789012');
    expect(out).toContain('arn:aws:iam::123456789012:user/alice');
    expect(out).toContain('AIDAEXAMPLE');
  });
});

describe('formatBucketTable', () => {
  it('returns empty state for no buckets', () => {
    expect(formatBucketTable([])).toBe('No buckets found.');
  });

  it('renders a markdown table', () => {
    const buckets: AwsBucket[] = [
      { name: 'alpha', creationDate: '2021-01-01T00:00:00Z' },
      { name: 'beta', creationDate: '2022-02-02T00:00:00Z' },
    ];
    const out = formatBucketTable(buckets);
    expect(out).toContain('| Name | Creation Date |');
    expect(out).toContain('alpha');
    expect(out).toContain('beta');
  });
});

describe('formatS3ObjectTable', () => {
  it('returns empty state for no objects', () => {
    expect(formatS3ObjectTable([])).toBe('No objects found.');
  });

  it('renders object rows', () => {
    const objects: AwsS3Object[] = [{ key: 'file.txt', size: 1234, lastModified: '2021-01-01 12:00:00' }];
    const out = formatS3ObjectTable(objects);
    expect(out).toContain('| Key | Size | Last Modified |');
    expect(out).toContain('file.txt');
    expect(out).toContain('1234');
  });
});

describe('formatInstanceTable', () => {
  it('returns empty state for no instances', () => {
    expect(formatInstanceTable([])).toBe('No instances found.');
  });

  it('renders instance rows with name fallback', () => {
    const instances: AwsEc2Instance[] = [
      {
        instanceId: 'i-1',
        state: 'running',
        type: 't3.micro',
        az: 'us-east-1a',
        privateIp: '10.0.0.5',
        publicIp: '',
        name: '',
      },
    ];
    const out = formatInstanceTable(instances);
    expect(out).toContain('| Instance ID | Name | State | Type | AZ | Private IP | Public IP |');
    expect(out).toContain('i-1');
    expect(out).toContain('running');
    // empty name and public IP render as '-'
    expect(out).toContain('| i-1 | - | running |');
  });
});
