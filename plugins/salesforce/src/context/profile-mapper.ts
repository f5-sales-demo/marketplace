import type { SalesforceContext, SalesforcePartner } from './salesforce-context';

interface ProfilePartial {
  manager?: { givenName?: string; familyName?: string };
  partner?: { id?: string; name: string; title?: string; role?: string };
  territories?: string[];
  role?: string;
}

function splitName(fullName: string): { givenName: string; familyName?: string } {
  const parts = fullName.trim().split(/\s+/);
  return {
    givenName: parts[0],
    familyName: parts.length > 1 ? parts.slice(1).join(' ') : undefined,
  };
}

function mapPartner(p: SalesforcePartner): ProfilePartial['partner'] {
  return { id: p.id, name: p.name, title: p.title, role: p.role };
}

export function mapSalesforceToProfile(ctx: SalesforceContext): ProfilePartial {
  const result: ProfilePartial = {};

  if (ctx.managerName) {
    result.manager = splitName(ctx.managerName);
  }

  if (ctx.discoveredPartner) {
    result.partner = mapPartner(ctx.discoveredPartner);
  }

  if (ctx.territories && ctx.territories.length > 0) {
    result.territories = ctx.territories;
  }

  if (ctx.discoveredRole) {
    result.role = ctx.discoveredRole;
  }

  return result;
}
