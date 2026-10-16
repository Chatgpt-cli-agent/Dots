import { afterEach, expect, it, vi } from 'vitest';
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  rmSync,
  readFileSync,
  symlinkSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createServer } from 'node:http';
import { WorkspaceStore } from '../src/server/workspace.js';
import { Store } from '../src/server/store.js';
import { Platform } from '../src/server/platform.js';
import { PluginService } from '../src/server/plugin-service.js';
import { pluginRoutes } from '../src/server/plugin-routes.js';
import {
  getSkillsRoot,
  getAvailableSkills,
  readSkillContent,
  skillsTools,
  matchAndLoadRelevantSkills,
} from '../src/server/skills-service.js';
import { createApp } from '../src/server/app.js';
import { Runner } from '../src/server/runner.js';

const cleanups: (() => void)[] = [];
afterEach(() => {
  cleanups
    .reverse()
    .splice(0)
    .forEach((fn) => fn());
  vi.unstubAllEnvs();
});

it('prefers the restored Dots skills folder when no explicit root is configured', () => {
  for (const name of [
    'SKILLS_PATH',
    'SKILLS_DIR',
    'OPENDOTS_SKILLS_PATH',
    'GALAXYONE_SKILLS_PATH',
  ])
    vi.stubEnv(name, '');
  expect(getSkillsRoot()).toBe(path.resolve(process.cwd(), 'skills'));
  expect(getAvailableSkills().some((skill) => skill.name === 'sims-4')).toBe(
    true,
  );
});
function fixture() {
  const root = mkdtempSync(path.join(tmpdir(), 'dots-plugin-'));
  cleanups.push(() => rmSync(root, { recursive: true, force: true }));
  const db = path.join(root, 'workspace.sqlite');
  const workspace = new WorkspaceStore(db, 'owner');
  cleanups.push(() => workspace.close());
  const source = path.join(root, 'source');
  mkdirSync(path.join(source, 'skills', 'build', 'references'), {
    recursive: true,
  });
  writeFileSync(
    path.join(source, 'plugin.json'),
    JSON.stringify({
      name: 'sims-builder',
      version: '1.0.0',
      skills: './skills/',
      description: 'Build planning',
    }),
  );
  writeFileSync(
    path.join(source, 'skills/build/SKILL.md'),
    '---\ndescription: Sims house building workflow\n---\nRead references/checklist.md',
  );
  writeFileSync(
    path.join(source, 'skills/build/references/checklist.md'),
    'Plan room circulation.',
  );
  const service = new PluginService(
    workspace.plugins,
    path.join(root, 'installed'),
  );
  return { root, db, workspace, source, service, dot: workspace.dots()[0] };
}

it('installs a stable snapshot and persists explicit assignments across database reopen', () => {
  const f = fixture();
  const plugin = f.service.install(f.source);
  expect(f.service.skills(f.dot.id)).toEqual([]);
  f.service.assign(plugin.id, f.dot.id, true);
  writeFileSync(path.join(f.source, 'skills/build/SKILL.md'), 'Changed source');
  const reopened = new WorkspaceStore(f.db, 'owner');
  try {
    const restored = new PluginService(
      reopened.plugins,
      path.join(f.root, 'installed'),
    );
    expect(restored.list()[0].dotIds).toEqual([f.dot.id]);
    const skills = restored.skills(f.dot.id);
    expect(readSkillContent('sims-builder:build', undefined, skills)).toContain(
      'Read references',
    );
    expect(
      readSkillContent('sims-builder:build', 'references/checklist.md', skills),
    ).toBe('Plan room circulation.');
  } finally {
    reopened.close();
  }
});

it('enforces enabled and per-Dot access in actual skill tools without stale caches', async () => {
  const f = fixture();
  vi.stubEnv('SKILLS_PATH', path.join(f.root, 'empty'));
  const p = f.service.install(f.source);
  f.service.assign(p.id, f.dot.id, true);
  const tools = skillsTools(
    () => {},
    () => f.service.skills(f.dot.id),
  );
  const reader = tools.find((t) => t.name === 'read_skill')!;
  expect(
    await reader.execute?.({ skill_name: 'sims-builder:build' }),
  ).toMatchObject({ content: expect.stringContaining('Read references') });
  expect(
    matchAndLoadRelevantSkills(
      'Sims house building',
      1,
      f.service.skills(f.dot.id),
    ),
  ).toContain('ACTIVATED SKILL: sims-builder:build');
  const other = f.workspace.createDot(
    f.dot.spaceId,
    'Other',
    'Other instructions',
    false,
    false,
  );
  expect(f.service.skills(other.id)).toEqual([]);
  const fingerprint = f.service.fingerprint(f.dot.id);
  f.service.enable(p.id, false);
  expect(f.service.fingerprint(f.dot.id)).not.toBe(fingerprint);
  expect(
    await reader.execute?.({ skill_name: 'sims-builder:build' }),
  ).toMatchObject({ content: expect.stringContaining('not available') });
  f.service.enable(p.id, true);
  expect(f.service.skills(f.dot.id)).toHaveLength(1);
  f.service.assign(p.id, f.dot.id, false);
  expect(f.service.skills(f.dot.id)).toEqual([]);
});

it('keeps standalone skills and prevents reference-file traversal', () => {
  const f = fixture();
  vi.stubEnv('SKILLS_PATH', path.join(f.source, 'skills'));
  expect(getAvailableSkills().map((s) => s.name)).toEqual(['build']);
  expect(readSkillContent('build')).toContain('Read references');
  expect(readSkillContent('build', '../../plugin.json')).toContain(
    'must stay inside',
  );
  expect(readSkillContent('../build')).toContain('not available');
});

it('accepts the Codex manifest location but explicitly rejects unsupported tool packages', () => {
  const f = fixture();
  mkdirSync(path.join(f.source, '.codex-plugin'));
  writeFileSync(
    path.join(f.source, '.codex-plugin/plugin.json'),
    readFileSync(path.join(f.source, 'plugin.json')),
  );
  const installed = f.service.install(f.source);
  expect(installed.name).toBe('sims-builder');
  f.service.uninstall(installed.id);
  writeFileSync(
    path.join(f.source, '.mcp.json'),
    JSON.stringify({ mcpServers: { bad: { command: 'node' } } }),
  );
  expect(() => f.service.install(f.source)).toThrow(
    'Subprocess and command transports are not permitted',
  );
});

it('rejects duplicate names, escaping skill paths, and leaves no partial registry entries', () => {
  const f = fixture();
  f.service.install(f.source);
  expect(() => f.service.install(f.source)).toThrow('already installed');
  writeFileSync(
    path.join(f.source, 'plugin.json'),
    JSON.stringify({ name: 'escape', version: '1', skills: '../outside' }),
  );
  expect(() => f.service.install(f.source)).toThrow('relative path');
  expect(f.service.list()).toHaveLength(1);
});

it('rejects package junctions before copying external resources', () => {
  const f = fixture();
  const outside = path.join(f.root, 'outside');
  mkdirSync(outside);
  writeFileSync(path.join(outside, 'private.txt'), 'not a plugin resource');
  symlinkSync(
    outside,
    path.join(f.source, 'linked'),
    process.platform === 'win32' ? 'junction' : 'dir',
  );
  expect(() => f.service.install(f.source)).toThrow('symbolic links');
  expect(f.service.list()).toEqual([]);
});

it('uninstalls assignments without changing source files or conversation history', () => {
  const f = fixture();
  const plugin = f.service.install(f.source);
  f.service.assign(plugin.id, f.dot.id, true);
  f.workspace.bindThread('kept', f.dot.id, 'Keep this');
  f.workspace.saveMessage('kept', 'user', 'Keep my conversation');
  f.service.uninstall(plugin.id);
  expect(f.service.list()).toEqual([]);
  expect(f.service.skills(f.dot.id)).toEqual([]);
  expect(
    readFileSync(path.join(f.source, 'skills/build/SKILL.md'), 'utf8'),
  ).toContain('Read references');
  expect(f.workspace.getNativeMessages('kept')[0].content).toBe(
    'Keep my conversation',
  );
});

it('routes installation and assignment through validated owner API operations', async () => {
  const f = fixture();
  const store = new Store(':memory:');
  cleanups.push(() => store.close());
  const platform = new Platform(store, f.workspace, {
    nativeMode: true,
    baseUrl: '',
    runtimeUrl: '',
    voiceName: '',
    slackUsers: [],
    pluginDirectory: path.join(f.root, 'installed'),
  });
  const app = pluginRoutes(platform);
  const installed = await app.request('/plugins', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path: f.source }),
  });
  expect(installed.status).toBe(201);
  const p = await installed.json();
  const assign = await app.request(`/plugins/${p.id}/dots/${f.dot.id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ assigned: true }),
  });
  expect(assign.status).toBe(200);
  expect(platform.plugins.skills(f.dot.id)[0].name).toBe('sims-builder:build');
  expect(
    (
      await app.request('/plugins', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      })
    ).status,
  ).toBe(400);
  expect(
    (
      await app.request(`/plugins/${p.id}/dots/foreign`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: '{"assigned":true}',
      })
    ).status,
  ).toBe(404);
});

it('protects plugin operations with the existing owner authentication and origin checks', async () => {
  const f = fixture();
  const store = new Store(':memory:');
  cleanups.push(() => store.close());
  const config = { mode: 'sample' as const, baseUrl: '' };
  const platform = new Platform(store, f.workspace, {
    nativeMode: true,
    baseUrl: '',
    runtimeUrl: '',
    voiceName: '',
    slackUsers: [],
    pluginDirectory: path.join(f.root, 'installed'),
  });
  const app = createApp({
    store,
    runner: new Runner(store, config),
    config,
    platform,
    ownerToken: 'owner-fixture',
  });
  expect((await app.request('/api/plugins')).status).toBe(401);
  const badOrigin = await app.request('/api/plugins', {
    headers: {
      Authorization: 'Bearer owner-fixture',
      Origin: 'https://foreign.example',
    },
  });
  expect(badOrigin.status).toBe(403);
  const badInstall = await app.request('/api/plugins', {
    method: 'POST',
    headers: {
      Authorization: 'Bearer owner-fixture',
      'Content-Type': 'application/json',
    },
    body: '{}',
  });
  expect(badInstall.status).toBe(400);
  const valid = await app.request('/api/plugins', {
    method: 'POST',
    headers: {
      Authorization: 'Bearer owner-fixture',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ path: f.source }),
  });
  expect(valid.status).toBe(201);
});

it('uses assigned plugin instructions and reads a reference through the real native model adapter', async () => {
  const f = fixture();
  vi.stubEnv('SKILLS_PATH', path.join(f.root, 'none'));
  const requests: Record<string, unknown>[] = [];
  const server = createServer(async (req, res) => {
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(Buffer.from(chunk));
    const body = JSON.parse(Buffer.concat(chunks).toString());
    requests.push(body);
    const hasResult = body.messages.some(
      (m: { role: string }) => m.role === 'tool',
    );
    const delta = hasResult
      ? { role: 'assistant', content: 'Plan room circulation.' }
      : {
          role: 'assistant',
          tool_calls: [
            {
              index: 0,
              id: 'plugin-read',
              type: 'function',
              function: {
                name: 'read_skill',
                arguments: JSON.stringify({
                  skill_name: 'sims-builder:build',
                  file: 'references/checklist.md',
                }),
              },
            },
          ],
        };
    res.writeHead(200, { 'Content-Type': 'text/event-stream' });
    res.write(
      `data: ${JSON.stringify({ id: 'fixture', object: 'chat.completion.chunk', created: 1, model: 'fixture', choices: [{ index: 0, delta, finish_reason: null }] })}\n\n`,
    );
    res.end(
      `data: ${JSON.stringify({ id: 'fixture', object: 'chat.completion.chunk', created: 1, model: 'fixture', choices: [{ index: 0, delta: {}, finish_reason: hasResult ? 'stop' : 'tool_calls' }] })}\n\ndata: [DONE]\n\n`,
    );
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const store = new Store(':memory:');
  try {
    const port = (server.address() as { port: number }).port;
    const platform = new Platform(store, f.workspace, {
      nativeMode: true,
      baseUrl: `http://127.0.0.1:${port}/v1`,
      model: 'fixture',
      runtimeUrl: '',
      voiceName: '',
      slackUsers: [],
      webSearchProvider: 'disabled',
      pluginDirectory: path.join(f.root, 'installed'),
    });
    const plugin = platform.plugins.install(f.source);
    platform.plugins.assign(plugin.id, f.dot.id, true);
    const thread = await platform.createConversation(f.dot.id, 'Plugin skill');
    expect(
      await platform.turn(
        thread.id,
        'Sims house building',
        new AbortController().signal,
      ),
    ).toContain('Plan room circulation.');
    expect(JSON.stringify(requests[0])).toContain(
      'ACTIVATED SKILL: sims-builder:build',
    );
    expect(JSON.stringify(requests.at(-1))).toContain('Plan room circulation.');
    expect(
      f.workspace
        .getToolExecutions(thread.id)
        .some((e) => e.toolName === 'read_skill' && e.status === 'completed'),
    ).toBe(true);
  } finally {
    store.close();
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
});
