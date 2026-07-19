import { describe, it, expect } from 'vitest';
import { workspaceTabs } from './workspaceTabs';

describe('workspaceTabs', () => {
  it('returns Overview + Settings + Members + Usage + Activity + Billing in order', () => {
    const tabs = workspaceTabs('overview', undefined);
    expect(tabs.map((t) => t.label)).toEqual([
      'Overview',
      'Settings',
      'Members',
      'Usage',
      'Activity',
      'Billing',
    ]);
    expect(tabs.map((t) => t.href)).toEqual([
      '/account/workspace',
      '/account/workspace/settings',
      '/account/workspace/members',
      '/account/workspace/usage',
      '/account/workspace/activity',
      '/account/workspace/billing',
    ]);
  });

  it('flags the Settings tab as active when selected', () => {
    const tabs = workspaceTabs('settings', undefined);
    expect(tabs.find((t) => t.label === 'Settings')?.active).toBe(true);
    expect(tabs.filter((t) => t.active)).toHaveLength(1);
  });

  it('flags the Activity tab as active when selected', () => {
    const tabs = workspaceTabs('activity', undefined);
    expect(tabs.find((t) => t.label === 'Activity')?.active).toBe(true);
    expect(tabs.filter((t) => t.active)).toHaveLength(1);
  });

  it('flags the Usage tab as active when selected', () => {
    const tabs = workspaceTabs('usage', undefined);
    expect(tabs.find((t) => t.label === 'Usage')?.active).toBe(true);
    expect(tabs.filter((t) => t.active)).toHaveLength(1);
  });

  it('flags the Billing tab as active when selected', () => {
    const tabs = workspaceTabs('billing', undefined);
    expect(tabs.find((t) => t.label === 'Billing')?.active).toBe(true);
    expect(tabs.filter((t) => t.active)).toHaveLength(1);
  });

  it('flags the active tab and only that one', () => {
    const tabs = workspaceTabs('members', undefined);
    expect(tabs.find((t) => t.label === 'Members')?.active).toBe(true);
    expect(tabs.find((t) => t.label === 'Overview')?.active).toBe(false);
  });

  it('leaves URLs clean for the default (no ?w=) workspace', () => {
    for (const t of workspaceTabs('overview', '')) {
      expect(t.href).not.toContain('?');
    }
    for (const t of workspaceTabs('overview', null)) {
      expect(t.href).not.toContain('?');
    }
  });

  it('carries the ?w= selection through, lowercased + encoded', () => {
    const tabs = workspaceTabs('members', 'Acme Corp');
    for (const t of tabs) {
      expect(t.href).toContain('?w=acme%20corp');
    }
    expect(tabs[0].href).toBe('/account/workspace?w=acme%20corp');
    expect(tabs[1].href).toBe('/account/workspace/settings?w=acme%20corp');
    expect(tabs[2].href).toBe('/account/workspace/members?w=acme%20corp');
    expect(tabs[3].href).toBe('/account/workspace/usage?w=acme%20corp');
    expect(tabs[4].href).toBe('/account/workspace/activity?w=acme%20corp');
    expect(tabs[5].href).toBe('/account/workspace/billing?w=acme%20corp');
  });

  it('trims the slug and treats non-strings as absent', () => {
    expect(workspaceTabs('overview', '  foo  ')[0].href).toBe('/account/workspace?w=foo');
    expect(workspaceTabs('overview', 42 as unknown)[0].href).toBe('/account/workspace');
  });
});
