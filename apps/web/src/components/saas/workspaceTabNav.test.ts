import { describe, it, expect } from 'vitest';
import { workspaceTabs } from './workspaceTabs';

describe('WorkspaceTabNav logic & workspaceTabs integration', () => {
  it('correctly sets active state for usage tab', () => {
    const tabs = workspaceTabs('usage', 'my-workspace');
    const activeTab = tabs.find((t) => t.active);
    expect(activeTab).toBeDefined();
    expect(activeTab?.label).toBe('Usage');
    expect(activeTab?.href).toBe('/account/workspace/usage?w=my-workspace');
  });

  it('ensures only one tab is active at a time', () => {
    const tabs = workspaceTabs('activity', 'test');
    const activeTabs = tabs.filter((t) => t.active);
    expect(activeTabs.length).toBe(1);
    expect(activeTabs[0].label).toBe('Activity');
  });
});
