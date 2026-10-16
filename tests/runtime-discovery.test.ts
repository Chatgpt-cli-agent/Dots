import { expect, it } from 'vitest';
import { Store } from '../src/server/store.js';
import { WorkspaceStore } from '../src/server/workspace.js';
import { Platform } from '../src/server/platform.js';

it('keeps saved conversation IDs available for private browser proxies', async () => {
  const store = new Store(':memory:');
  const workspace = new WorkspaceStore(':memory:', 'owner');
  const dot = workspace.dots()[0];
  workspace.bindThread('saved-thread', dot.id, 'Existing chat');
  const platform = new Platform(store, workspace, {
    nativeMode: true,
    baseUrl: 'http://127.0.0.1:11434/v1',
    voiceName: 'marin',
    slackUsers: [],
    runtimeUrl: 'http://localhost/api/copilotkit',
  });
  try {
    const response = await platform.handle(
      new Request('http://localhost/api/copilotkit/info'),
    );
    expect(response.status).toBe(200);
    const info = await response.json();
    expect(Object.keys(info.agents)).toEqual([dot.id]);
    expect(info.agents['chat-saved-thread']).toBeUndefined();
    expect(workspace.requireThread('saved-thread', dot.id).title).toBe(
      'Existing chat',
    );
  } finally {
    await platform.stop();
    workspace.close();
    store.close();
  }
});
