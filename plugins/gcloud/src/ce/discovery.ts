import { createHash } from 'node:crypto';
import { type GcloudExecApi, parseGcloudJsonOutput } from '../gcloud/exec';
import { GCP_CE_IMAGE_PROJECT, type GcpCeDiscovery, type GcpCeImage, type GcpCeReceipt } from './types';
import { validateImage, validateScope } from './validation';

export function fingerprint(value: unknown): string {
  const stable = (item: unknown): unknown =>
    Array.isArray(item)
      ? item.map(stable)
      : item && typeof item === 'object'
        ? Object.fromEntries(
            Object.entries(item)
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([k, v]) => [k, stable(v)]),
          )
        : item;
  return `sha256:${createHash('sha256')
    .update(JSON.stringify(stable(value)))
    .digest('hex')}`;
}
export function selectF5Images(rows: GcpCeImage[]): GcpCeImage[] {
  if (!Array.isArray(rows)) throw new Error('Malformed image inventory');
  return rows
    .flatMap((image) => {
      try {
        image = { ...image, architecture: image.architecture ?? 'X86_64' };
        validateImage(image);
        return [
          {
            id: image.id,
            name: image.name,
            selfLink: image.selfLink,
            licenses: [...image.licenses],
            architecture: image.architecture,
            status: image.status,
          },
        ];
      } catch {
        return [];
      }
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}
export async function discoverGcp(
  api: GcloudExecApi,
  project: string,
  region: string,
  signal?: AbortSignal,
): Promise<GcpCeDiscovery> {
  validateScope(project, region);
  const receipts: GcpCeReceipt[] = [];
  async function query<T>(args: string[]): Promise<T> {
    if (signal?.aborted) throw new Error('Discovery cancelled');
    const output = await api.exec('gcloud', args, { signal });
    if (output.exitCode !== 0) throw new Error('GCP discovery query failed');
    const value = parseGcloudJsonOutput<T>(output.stdout);
    receipts.push({
      source: 'gcloud',
      argv: [...args],
      observedAt: new Date().toISOString(),
      sha256: fingerprint(value),
    });
    return value;
  }
  // gcloud automatically consumes list pagination. Do not add --limit; standard
  // public OS images must be excluded even when an explicit project is supplied.
  const images = selectF5Images(
    await query<GcpCeImage[]>([
      'compute',
      'images',
      'list',
      `--project=${GCP_CE_IMAGE_PROJECT}`,
      '--no-standard-images',
      '--filter=name~^f5xc-ce',
      '--format=json(id,name,selfLink,status,licenses,architecture)',
    ]),
  );
  const billing = await query<{ billingEnabled?: boolean }>([
    'billing',
    'projects',
    'describe',
    project,
    `--project=${project}`,
    '--format=json(billingEnabled)',
  ]);
  const services = await query<Array<{ config?: { name?: string } }>>([
    'services',
    'list',
    '--enabled',
    `--project=${project}`,
    '--format=json(config.name)',
  ]);
  const cloudRegion = await query<{ quotas?: GcpCeDiscovery['quotas'] }>([
    'compute',
    'regions',
    'describe',
    region,
    `--project=${project}`,
    '--format=json(quotas)',
  ]);
  const machines = await query<Array<{ name: string; zone: string; guestCpus: number; memoryMb: number }>>([
    'compute',
    'machine-types',
    'list',
    `--project=${project}`,
    `--filter=zone:(${region}-)`,
    '--format=json(name,zone,guestCpus,memoryMb)',
  ]);
  if (!Array.isArray(services) || !Array.isArray(machines) || !Array.isArray(cloudRegion.quotas))
    throw new Error('Incomplete discovery response');
  return {
    schemaVersion: 1,
    project,
    region,
    observedAt: new Date().toISOString(),
    receipts,
    images,
    machineTypes: machines.map((m) => ({
      name: m.name,
      zone: m.zone.split('/').at(-1) ?? '',
      guestCpus: m.guestCpus,
      memoryMb: m.memoryMb,
    })),
    billingEnabled: typeof billing.billingEnabled === 'boolean' ? billing.billingEnabled : null,
    enabledApis: services.flatMap((s) => (s.config?.name ? [s.config.name] : [])),
    quotas: cloudRegion.quotas,
    checks: {
      iam: 'unknown',
      organizationPolicy: 'unknown',
      zoneCapacity: 'unknown',
      machineNicLimit: 'unknown',
      licenseAcceptance: 'unknown',
    },
  };
}
