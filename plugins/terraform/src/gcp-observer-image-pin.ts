/** Original qualification image; changing it requires fresh image/disk and guest evidence. */
export const GCP_OBSERVER_IMAGE_PIN = Object.freeze({
  project: 'ubuntu-os-cloud',
  name: 'ubuntu-2404-noble-amd64-v20261021',
  id: '4996011480491275419',
  architecture: 'X86_64',
  status: 'READY',
  selfLink:
    'https://www.googleapis.com/compute/v1/projects/ubuntu-os-cloud/global/images/ubuntu-2404-noble-amd64-v20261021',
} as const);
