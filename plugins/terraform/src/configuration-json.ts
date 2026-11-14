/** Terraform JSON requires labels on resource blocks; omit the optional block when no resources remain. */
export function renderTerraformConfigurationJson(configuration: Record<string, unknown>): string {
  const result = { ...configuration };
  const resources = result.resource;
  if (resources && typeof resources === 'object' && !Array.isArray(resources) && Object.keys(resources).length === 0)
    delete result.resource;
  return JSON.stringify(result);
}
