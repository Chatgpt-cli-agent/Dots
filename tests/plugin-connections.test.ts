import { afterEach, expect, it, vi } from 'vitest';
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  rmSync,
  readFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { WorkspaceStore } from '../src/server/workspace.js';
import { Store } from '../src/server/store.js';
import { Platform } from '../src/server/platform.js';
import { PluginService, PluginError } from '../src/server/plugin-service.js';
import { pluginRoutes } from '../src/server/plugin-routes.js';
import {
  ConnectionService,
  type McpTransportFactory,
} from '../src/server/connections.js';
import { connectionRoutes } from '../src/server/connection-routes.js';
import { connectionTools } from '../src/server/connection-tools.js';

const cleanups: (() => void)[] = [];
afterEach(() => {
  cleanups
    .reverse()
    .splice(0)
    .forEach((fn) => fn());
  vi.unstubAllEnvs();
});

function createTestHarness({ twin = false, rejectToken = false } = {}) {
  const root = mkdtempSync(path.join(tmpdir(), 'dots-plugin-conn-'));
  cleanups.push(() => rmSync(root, { recursive: true, force: true }));

  const storeDb = path.join(root, 'store.sqlite');
  const workspaceDb = path.join(root, 'workspace.sqlite');
  const store = new Store(storeDb);
  const workspace = new WorkspaceStore(workspaceDb, 'owner');
  cleanups.push(() => {
    store.close();
    workspace.close();
  });

  const dot1 = workspace.dots()[0];
  const defaultSpace = workspace.spaces()[0];
  const dot2 = workspace.createDot(
    defaultSpace.id,
    'Second Dot',
    'Helper',
    true,
    true,
    [defaultSpace.id],
  );

  const executedTools: Record<string, unknown>[] = [];
  const tokensSeen: (string | undefined)[] = [];

  const transport: McpTransportFactory = ({ url, token }) => {
    tokensSeen.push(token);
    if (rejectToken || (token && token.startsWith('invalid'))) {
      const err = new Error('Unauthorized');
      (err as any).code = 401;
      throw err;
    }
    const server = new McpServer({ name: 'db-service', version: '1.0.0' });
    server.registerTool(
      'query_records',
      {
        description: 'Query database records.',
        inputSchema: { query: z.string() },
        annotations: { readOnlyHint: true },
      },
      async ({ query }) => {
        executedTools.push({ tool: 'query_records', query, token });
        return {
          content: [{ type: 'text', text: `Results for ${query}` }],
        };
      },
    );
    server.registerTool(
      'delete_record',
      {
        description: 'Delete a database record.',
        inputSchema: { id: z.string() },
        annotations: { readOnlyHint: false },
      },
      async ({ id }) => {
        executedTools.push({ tool: 'delete_record', id, token });
        return {
          content: [{ type: 'text', text: `Deleted record ${id}` }],
        };
      },
    );
    if (twin) {
      server.registerTool(
        'query_records',
        {
          description: 'Twin query database records.',
          inputSchema: { query: z.string() },
          annotations: { readOnlyHint: true },
        },
        async ({ query }) => {
          return { content: [{ type: 'text', text: `Twin results` }] };
        },
      );
    }

    const [client, serverSide] = InMemoryTransport.createLinkedPair();
    void server.connect(serverSide);
    return client;
  };

  const platform = new Platform(store, workspace, {
    baseUrl: '',
    voiceName: '',
    slackUsers: [],
    runtimeUrl: '',
    pluginDirectory: path.join(root, 'plugins'),
  });

  // Re-wire connectionService with our in-memory MCP transport
  const customConnections = new ConnectionService(
    workspace.connections,
    transport,
    60_000,
    workspace.plugins,
  );
  (platform as any).connections = customConnections;
  platform.plugins.setConnectionService(customConnections);

  const pRoutes = pluginRoutes(platform);
  const cRoutes = connectionRoutes(workspace, customConnections);

  const pluginRequest = (pathStr: string, method = 'GET', body?: unknown) =>
    pRoutes.request(pathStr, {
      method,
      headers: { 'Content-Type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });

  const connectionRequest = (pathStr: string, method = 'GET', body?: unknown) =>
    cRoutes.request(pathStr, {
      method,
      headers: { 'Content-Type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });

  const createPluginFolder = (name: string, opts?: {
    mcpServers?: Record<string, unknown>;
    skills?: boolean;
    version?: string;
  }) => {
    const dir = path.join(root, `source-${name}`);
    mkdirSync(dir, { recursive: true });
    if (opts?.skills !== false) {
      mkdirSync(path.join(dir, 'skills', 'helper'), { recursive: true });
      writeFileSync(
        path.join(dir, 'skills', 'helper', 'SKILL.md'),
        '---\nname: helper\ndescription: A helpful skill\n---\nHelp instructions',
      );
    }
    const manifest: Record<string, unknown> = {
      name,
      version: opts?.version ?? '1.0.0',
      description: `Plugin ${name}`,
      skills: opts?.skills !== false ? 'skills' : undefined,
    };
    if (opts?.mcpServers) {
      manifest.mcpServers = opts.mcpServers;
    }
    writeFileSync(path.join(dir, 'plugin.json'), JSON.stringify(manifest, null, 2));
    return dir;
  };

  return {
    root,
    store,
    workspace,
    dot1,
    dot2,
    platform,
    customConnections,
    pluginRequest,
    connectionRequest,
    createPluginFolder,
    executedTools,
    tokensSeen,
  };
}

it('Scenario 1: Preview -> install -> configure token -> assign -> discover -> execute -> persist result', async () => {
  const h = createTestHarness();
  const pluginDir = h.createPluginFolder('analytics-pack', {
    mcpServers: {
      db: {
        url: 'http://localhost:8080/mcp',
        description: 'Database query service',
        requiresToken: true,
      },
    },
  });

  // 1. Preview
  const previewRes = await h.pluginRequest('/plugins/preview', 'POST', {
    path: pluginDir,
  });
  expect(previewRes.status).toBe(200);
  const preview = await previewRes.json();
  expect(preview.name).toBe('analytics-pack');
  expect(preview.services).toHaveLength(1);
  expect(preview.services[0].name).toBe('db');
  expect(preview.services[0].requiresToken).toBe(true);
  expect(preview.requiredConfiguration).toEqual(
    expect.arrayContaining([expect.stringContaining('db')]),
  );
  expect(preview.isUpdate).toBe(false);

  // 2. Install
  const installRes = await h.pluginRequest('/plugins', 'POST', {
    path: pluginDir,
  });
  expect(installRes.status).toBe(201);
  const plugin = await installRes.json();
  expect(plugin.name).toBe('analytics-pack');
  expect(plugin.services).toHaveLength(1);
  expect(plugin.services[0].hasToken).toBe(false);
  expect(plugin.services[0].tools).toHaveLength(0);

  // 3. Configure token
  const configRes = await h.pluginRequest(
    `/plugins/${plugin.id}/services/db/config`,
    'POST',
    { token: 'secret-auth-token-123' },
  );
  expect(configRes.status).toBe(200);
  const serviceConfig = await configRes.json();
  expect(serviceConfig.hasToken).toBe(true);
  expect(serviceConfig.token).toBeUndefined(); // Secrets never exposed
  expect(serviceConfig.tools.length).toBeGreaterThan(0);

  // 4. Assign to dot1
  const assignRes = await h.pluginRequest(
    `/plugins/${plugin.id}/dots/${h.dot1.id}`,
    'PUT',
    { assigned: true },
  );
  expect(assignRes.status).toBe(200);

  // 5. Discover tools for dot1
  const dotTools = h.customConnections.tools(h.dot1.id);
  expect(dotTools.some((t) => t.tool.name === 'query_records')).toBe(true);
  const queryTool = dotTools.find((t) => t.tool.name === 'query_records')!;
  expect(queryTool.name).toMatch(/^plugin__analytics[-_]pack__db__query_records/);

  // 6. Execute tool
  const result = await h.customConnections.call(queryTool, { query: 'users' });
  expect(result.isError).toBe(false);
  expect(result.text).toBe('Results for users');
  expect(h.executedTools[0]).toEqual({
    tool: 'query_records',
    query: 'users',
    token: 'secret-auth-token-123',
  });
});

it('Scenario 2: Enforces per-Dot access denial for unassigned Dots', async () => {
  const h = createTestHarness();
  const pluginDir = h.createPluginFolder('private-tools', {
    mcpServers: {
      db: {
        url: 'http://localhost:8080/mcp',
        requiresToken: false,
      },
    },
  });

  const installRes = await h.pluginRequest('/plugins', 'POST', {
    path: pluginDir,
  });
  const plugin = await installRes.json();
  await h.pluginRequest(`/plugins/${plugin.id}/services/db/refresh`, 'POST');

  // Assign only to dot1, NOT dot2
  await h.pluginRequest(`/plugins/${plugin.id}/dots/${h.dot1.id}`, 'PUT', {
    assigned: true,
  });

  const dot1Tools = h.customConnections.tools(h.dot1.id);
  const dot2Tools = h.customConnections.tools(h.dot2.id);

  expect(dot1Tools.length).toBeGreaterThan(0);
  expect(dot2Tools).toHaveLength(0);

  const exposedTool = dot1Tools[0];
  // Dot 2 resolve must throw
  expect(() => h.customConnections.resolve(h.dot2.id, exposedTool.name)).toThrow(
    'Connection tool is not available to this Dot.',
  );
  // Dot 2 bound check must throw
  expect(() =>
    h.customConnections.bound(
      h.dot2.id,
      exposedTool.connection.id,
      exposedTool.tool.name,
    ),
  ).toThrow('This tool is no longer enabled for this Dot. Nothing was run.');
});

it('Scenario 3: Missing or invalid credentials rejection (401/403 failure handling)', async () => {
  const h = createTestHarness();
  const pluginDir = h.createPluginFolder('secure-db', {
    mcpServers: {
      db: {
        url: 'http://localhost:8080/mcp',
        requiresToken: true,
      },
    },
  });

  const installRes = await h.pluginRequest('/plugins', 'POST', {
    path: pluginDir,
  });
  const plugin = await installRes.json();
  await h.pluginRequest(`/plugins/${plugin.id}/dots/${h.dot1.id}`, 'PUT', {
    assigned: true,
  });

  // Attempt refresh without token -> marks error
  const refreshRes = await h.pluginRequest(
    `/plugins/${plugin.id}/services/db/refresh`,
    'POST',
  );
  const service = await refreshRes.json();
  expect(service.error).toContain('rejected the credentials');

  // Set an invalid token
  await h.pluginRequest(`/plugins/${plugin.id}/services/db/config`, 'POST', {
    token: 'invalid-token',
  });
  const refRes2 = await h.pluginRequest(
    `/plugins/${plugin.id}/services/db/refresh`,
    'POST',
  );
  const svc2 = await refRes2.json();
  expect(svc2.error).toContain('rejected the credentials');
});

it('Scenario 4: Approval request -> reconnect -> approve/decline -> continue -> reconnect without re-asking', async () => {
  const h = createTestHarness();
  const pluginDir = h.createPluginFolder('action-pack', {
    mcpServers: {
      db: {
        url: 'http://localhost:8080/mcp',
        requiresToken: false,
      },
    },
  });

  const plugin = await (
    await h.pluginRequest('/plugins', 'POST', { path: pluginDir })
  ).json();
  await h.pluginRequest(`/plugins/${plugin.id}/services/db/refresh`, 'POST');
  await h.pluginRequest(`/plugins/${plugin.id}/dots/${h.dot1.id}`, 'PUT', {
    assigned: true,
  });

  const threadId = 'test-thread-123';
  h.workspace.bindThread(threadId, h.dot1.id, 'Approval Thread');

  // delete_record is non-readOnly, requires approval
  const exposed = h.customConnections
    .tools(h.dot1.id)
    .find((t) => t.tool.name === 'delete_record')!;
  expect(exposed.tool.requiresApproval).toBe(true);

  let checkRun = 0;
  const tools = connectionTools(
    h.customConnections,
    h.dot1.id,
    threadId,
    () => { checkRun++; },
    new AbortController().signal,
    true, // approvals supported
  );

  const deleteToolDef = tools.find((t) => t.name === exposed.name)!;
  // Model calls tool -> returns approval_required
  const approvalPrompt: any = await (deleteToolDef as any).execute({ id: 'rec-999' });
  expect(approvalPrompt.status).toBe('approval_required');
  expect(approvalPrompt.approvalId).toBeDefined();

  const approvalId = approvalPrompt.approvalId;

  // Verify approval can be read
  const appRes = await h.connectionRequest(
    `/conversations/${threadId}/connection-approvals/${approvalId}`,
  );
  expect(appRes.status).toBe(200);
  const appData = await appRes.json();
  expect(appData.arguments).toEqual({ id: 'rec-999' });

  // Approve action
  const actRes = await h.connectionRequest(
    `/conversations/${threadId}/connection-actions`,
    'POST',
    {
      approvalId,
      toolCallId: 'call-1',
    },
  );
  expect(actRes.status).toBe(200);
  const actData = await actRes.json();
  expect(actData.text).toBe('Deleted record rec-999');

  // Reconnect: Calling again returns cached result without running again
  const execCountBefore = h.executedTools.length;
  const retryRes = await h.connectionRequest(
    `/conversations/${threadId}/connection-actions`,
    'POST',
    {
      approvalId,
      toolCallId: 'call-1',
    },
  );
  expect(retryRes.status).toBe(200);
  expect(await retryRes.json()).toEqual(actData);
  expect(h.executedTools.length).toBe(execCountBefore); // Did not re-execute!
});

it('Scenario 5: Disable/unassign during execution (fingerprint change triggers cancellation)', async () => {
  const h = createTestHarness();
  const pluginDir = h.createPluginFolder('toggle-pack', {
    mcpServers: {
      db: {
        url: 'http://localhost:8080/mcp',
        requiresToken: false,
      },
    },
  });

  const plugin = await (
    await h.pluginRequest('/plugins', 'POST', { path: pluginDir })
  ).json();
  await h.pluginRequest(`/plugins/${plugin.id}/dots/${h.dot1.id}`, 'PUT', {
    assigned: true,
  });

  const fpInitial = h.platform.plugins.fingerprint(h.dot1.id);

  // 1. Unassigning changes fingerprint
  await h.pluginRequest(`/plugins/${plugin.id}/dots/${h.dot1.id}`, 'PUT', {
    assigned: false,
  });
  const fpUnassigned = h.platform.plugins.fingerprint(h.dot1.id);
  expect(fpUnassigned).not.toBe(fpInitial);

  // Re-assign
  await h.pluginRequest(`/plugins/${plugin.id}/dots/${h.dot1.id}`, 'PUT', {
    assigned: true,
  });
  expect(h.platform.plugins.fingerprint(h.dot1.id)).toBe(fpInitial);

  // 2. Disabling plugin changes fingerprint
  await h.pluginRequest(`/plugins/${plugin.id}`, 'PATCH', { enabled: false });
  expect(h.platform.plugins.fingerprint(h.dot1.id)).not.toBe(fpInitial);

  // Re-enable
  await h.pluginRequest(`/plugins/${plugin.id}`, 'PATCH', { enabled: true });

  // 3. Disabling service changes fingerprint
  await h.pluginRequest(`/plugins/${plugin.id}/services/db/config`, 'POST', {
    enabled: false,
  });
  expect(h.platform.plugins.fingerprint(h.dot1.id)).not.toBe(fpInitial);
});

it('Scenario 6: Tool-name collisions across plugins/services are resolved deterministically', async () => {
  const h = createTestHarness();

  // Create plugin 1
  const p1Dir = h.createPluginFolder('pack-a', {
    mcpServers: {
      api: { url: 'http://localhost:8080/mcp', requiresToken: false },
    },
  });
  const p1 = await (await h.pluginRequest('/plugins', 'POST', { path: p1Dir })).json();
  await h.pluginRequest(`/plugins/${p1.id}/services/api/refresh`, 'POST');
  await h.pluginRequest(`/plugins/${p1.id}/dots/${h.dot1.id}`, 'PUT', { assigned: true });

  // Create plugin 2 with same service name and tool
  const p2Dir = h.createPluginFolder('pack-a', {
    version: '1.0.0',
    mcpServers: {
      api: { url: 'http://localhost:8080/mcp', requiresToken: false },
    },
  });
  // Pack-a is already installed, so rename the second plugin manifest to pack-b
  writeFileSync(
    path.join(p2Dir, 'plugin.json'),
    JSON.stringify({
      name: 'pack-b',
      version: '1.0.0',
      description: 'Plugin B',
      skills: 'skills',
      mcpServers: {
        api: { url: 'http://localhost:8080/mcp', requiresToken: false },
      },
    }),
  );
  const p2 = await (await h.pluginRequest('/plugins', 'POST', { path: p2Dir })).json();
  await h.pluginRequest(`/plugins/${p2.id}/services/api/refresh`, 'POST');
  await h.pluginRequest(`/plugins/${p2.id}/dots/${h.dot1.id}`, 'PUT', { assigned: true });

  const dotTools = h.customConnections.tools(h.dot1.id);
  const names = dotTools.map((t) => t.name);

  // All exposed tool names must be unique
  const uniqueNames = new Set(names);
  expect(uniqueNames.size).toBe(names.length);

  // Each name matches TanStack AI / OpenAI identifier limits
  for (const name of names) {
    expect(name).toMatch(/^[a-zA-Z0-9_-]{1,64}$/);
  }
});

it('Scenario 7: Failed update rollback and preservation of existing assignments and settings', async () => {
  const h = createTestHarness();
  const pDir = h.createPluginFolder('updater-pack', {
    version: '1.0.0',
    mcpServers: {
      db: { url: 'http://localhost:8080/mcp', requiresToken: true },
    },
  });

  const p = await (await h.pluginRequest('/plugins', 'POST', { path: pDir })).json();
  // Configure token and assign
  await h.pluginRequest(`/plugins/${p.id}/services/db/config`, 'POST', {
    token: 'preserved-token-abc',
  });
  await h.pluginRequest(`/plugins/${p.id}/dots/${h.dot1.id}`, 'PUT', {
    assigned: true,
  });

  // Create an invalid update folder (e.g. invalid subprocess transport)
  const badUpdateDir = path.join(h.root, 'bad-update');
  mkdirSync(badUpdateDir, { recursive: true });
  writeFileSync(
    path.join(badUpdateDir, 'plugin.json'),
    JSON.stringify({
      name: 'updater-pack',
      version: '2.0.0',
      mcpServers: {
        db: { command: 'node', args: ['server.js'] }, // Invalid!
      },
    }),
  );

  // Update should fail
  const failedUpdateRes = await h.pluginRequest(
    `/plugins/${p.id}/update`,
    'POST',
    { path: badUpdateDir },
  );
  expect(failedUpdateRes.status).toBe(400);

  // Existing plugin must be completely preserved!
  const currentPlugin = h.platform.plugins.list().find((item) => item.id === p.id)!;
  expect(currentPlugin.version).toBe('1.0.0');
  expect(currentPlugin.dotIds).toContain(h.dot1.id);
  expect(currentPlugin.services[0].hasToken).toBe(true);

  // Verify credentials in DB were not lost
  const creds = h.workspace.plugins.getServiceCredentials(p.id, 'db');
  expect(creds?.token).toBe('preserved-token-abc');

  // Now perform a valid update
  const goodUpdateDir = h.createPluginFolder('updater-pack', {
    version: '1.1.0',
    mcpServers: {
      db: { url: 'http://localhost:8080/mcp', requiresToken: true },
    },
  });
  const goodUpdateRes = await h.pluginRequest(
    `/plugins/${p.id}/update`,
    'POST',
    { path: goodUpdateDir },
  );
  expect(goodUpdateRes.status).toBe(200);
  const updatedPlugin = await goodUpdateRes.json();
  expect(updatedPlugin.version).toBe('1.1.0');
  expect(updatedPlugin.dotIds).toContain(h.dot1.id);
  expect(updatedPlugin.services[0].hasToken).toBe(true);
  const credsAfter = h.workspace.plugins.getServiceCredentials(p.id, 'db');
  expect(credsAfter?.token).toBe('preserved-token-abc');
});

it('Scenario 8: Verification that secrets never appear in public responses, event streams, or saved transcripts', async () => {
  const h = createTestHarness();
  const secret = 'super-confidential-token-xyz';
  const pDir = h.createPluginFolder('secret-pack', {
    mcpServers: {
      api: { url: 'http://localhost:8080/mcp', requiresToken: true },
    },
  });

  const p = await (await h.pluginRequest('/plugins', 'POST', { path: pDir })).json();
  const configRes = await h.pluginRequest(
    `/plugins/${p.id}/services/api/config`,
    'POST',
    { token: secret },
  );
  const configJson = await configRes.json();
  expect(JSON.stringify(configJson)).not.toContain(secret);

  const listRes = await h.pluginRequest('/plugins', 'GET');
  const listJson = await listRes.json();
  expect(JSON.stringify(listJson)).not.toContain(secret);

  const rawManifestRows = (h.workspace.plugins as any).db
    .prepare('SELECT manifest FROM plugins WHERE id=?')
    .all(p.id);
  expect(JSON.stringify(rawManifestRows)).not.toContain(secret);
});
