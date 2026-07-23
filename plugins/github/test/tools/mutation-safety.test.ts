import { describe, expect, it } from 'bun:test';
import {
  confirmMutation,
  HEADLESS_BLOCKED_MESSAGE,
  headlessMutationsAllowed,
  resolveApprovalMode,
} from '../../src/tools/mutation-safety';

const uiCtx = { hasUI: true, ui: { confirm: async () => true } };

describe('headlessMutationsAllowed', () => {
  it('is true only for explicit opt-in values', () => {
    expect(headlessMutationsAllowed({ GITHUB_ALLOW_MUTATIONS: '1' })).toBe(true);
    expect(headlessMutationsAllowed({ GITHUB_ALLOW_MUTATIONS: 'true' })).toBe(true);
    expect(headlessMutationsAllowed({ GITHUB_ALLOW_MUTATIONS: '0' })).toBe(false);
    expect(headlessMutationsAllowed({})).toBe(false);
  });
});

describe('resolveApprovalMode', () => {
  it('is interactive when a usable confirm UI is present', () => {
    expect(resolveApprovalMode(uiCtx, {})).toBe('interactive');
  });
  it('is headless-allowed when no UI but opt-in is set', () => {
    expect(resolveApprovalMode({ hasUI: false }, { GITHUB_ALLOW_MUTATIONS: '1' })).toBe('headless-allowed');
    expect(resolveApprovalMode(undefined, { GITHUB_ALLOW_MUTATIONS: '1' })).toBe('headless-allowed');
  });
  it('is headless-blocked when no UI and no opt-in', () => {
    expect(resolveApprovalMode({ hasUI: false }, {})).toBe('headless-blocked');
    expect(resolveApprovalMode({ hasUI: true, ui: {} }, {})).toBe('headless-blocked');
    expect(resolveApprovalMode(undefined, {})).toBe('headless-blocked');
  });
});

describe('confirmMutation', () => {
  it('returns true when confirmed and no rewrite', async () => {
    const calls: string[] = [];
    const ui = { confirm: async (t: string) => { calls.push(t); return true; } };
    expect(await confirmMutation(ui, { title: 'A', message: 'm' })).toBe(true);
    expect(calls).toEqual(['A']);
  });
  it('returns false immediately when the base confirm is denied', async () => {
    const calls: string[] = [];
    const ui = { confirm: async (t: string) => { calls.push(t); return false; } };
    expect(await confirmMutation(ui, { title: 'A', message: 'm', rewrite: { title: 'B', message: 'm2' } })).toBe(false);
    expect(calls).toEqual(['A']); // rewrite confirm not reached
  });
  it('requires the rewrite confirm when a rewrite is present', async () => {
    const calls: string[] = [];
    const ui = { confirm: async (t: string) => { calls.push(t); return t === 'A' ? true : false; } };
    expect(await confirmMutation(ui, { title: 'A', message: 'm', rewrite: { title: 'B', message: 'm2' } })).toBe(false);
    expect(calls).toEqual(['A', 'B']);
  });
  it('returns true when both base and rewrite are confirmed', async () => {
    const ui = { confirm: async () => true };
    expect(await confirmMutation(ui, { title: 'A', message: 'm', rewrite: { title: 'B', message: 'm2' } })).toBe(true);
  });
});

describe('HEADLESS_BLOCKED_MESSAGE', () => {
  it('names the opt-in escape hatch', () => {
    expect(HEADLESS_BLOCKED_MESSAGE).toContain('GITHUB_ALLOW_MUTATIONS');
  });
});
