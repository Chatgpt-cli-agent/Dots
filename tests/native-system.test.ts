import { afterEach, expect, it, vi } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { Store } from '../src/server/store.js';
import { WorkspaceStore } from '../src/server/workspace.js';
import { Platform } from '../src/server/platform.js';
import { ComputerService } from '../src/server/computer-service.js';
import type { PlatformConfig } from '../src/server/platform-config.js';

const resources: (() => void)[] = [];
afterEach(() => {
  resources.splice(0).forEach((close) => close());
  vi.restoreAllMocks();
});

function createTestDbPath(): string {
  const tmpDir = path.join(process.cwd(), '.tmp-test');
  fs.mkdirSync(tmpDir, { recursive: true });
  const dbPath = path.join(tmpDir, `test-${Date.now()}-${Math.random().toString(36).slice(2)}.sqlite`);
  resources.push(() => {
    try {
      if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
    } catch {}
  });
  return dbPath;
}

it('manages conversation lifecycle in SQLite without CopilotKit Intelligence keys', async () => {
  const dbPath = createTestDbPath();
  const store = new Store(':memory:');
  const workspace = new WorkspaceStore(dbPath, 'owner-1');
  resources.push(() => {
    store.close();
    workspace.close();
  });

  const config: PlatformConfig = {
    baseUrl: 'http://127.0.0.1:11434/v1',
    nativeMode: true,
    voiceName: 'marin',
    slackUsers: [],
    runtimeUrl: 'http://localhost/api/copilotkit',
  };

  const platform = new Platform(store, workspace, config);

  // 1. Setup reports readiness in native mode without Intelligence key
  const setup = platform.setup();
  expect(setup.intelligence).toBe(true);
  expect(setup.missing).toEqual([]);

  // 2. Create conversation
  const dot = workspace.dots()[0];
  const conversation = await platform.createConversation(dot.id, 'Native Test Thread');
  expect(conversation.id).toBeDefined();
  expect(conversation.dotId).toBe(dot.id);

  // 3. Save incoming message before execution and verify persistence
  workspace.saveMessage(conversation.id, 'user', 'Hello specialist!', {
    id: 'msg-user-1',
  });
  const messagesBefore = workspace.getNativeMessages(conversation.id);
  expect(messagesBefore).toHaveLength(1);
  expect(messagesBefore[0].content).toBe('Hello specialist!');

  // 4. Create run record and verify single active run per thread
  const run1 = workspace.createRun({
    id: 'run-1',
    threadId: conversation.id,
    dotId: dot.id,
  });
  expect(workspace.getActiveRun(conversation.id)?.id).toBe('run-1');

  // Second run cancels previous active run
  workspace.cancelActiveRuns(conversation.id);
  expect(workspace.getRun('run-1')?.status).toBe('cancelled');

  const run2 = workspace.createRun({
    id: 'run-2',
    threadId: conversation.id,
    dotId: dot.id,
  });
  expect(workspace.getActiveRun(conversation.id)?.id).toBe('run-2');

  // Complete run2 and record assistant message
  workspace.updateRun(run2.id, {
    status: 'completed',
    finishedAt: Date.now(),
  });
  workspace.saveMessage(conversation.id, 'assistant', 'Here is the answer.', {
    id: 'msg-assistant-1',
    runId: run2.id,
  });

  // 5. Durable replay after reload/restart: open new WorkspaceStore reading the same DB
  const reopenedWorkspace = new WorkspaceStore(dbPath, 'owner-1');
  resources.push(() => reopenedWorkspace.close());

  const restoredThreads = reopenedWorkspace.conversations();
  expect(restoredThreads.some((t) => t.id === conversation.id)).toBe(true);

  const restoredMessages = reopenedWorkspace.getNativeMessages(conversation.id);
  expect(restoredMessages).toHaveLength(2);
  expect(restoredMessages[0].id).toBe('msg-user-1');
  expect(restoredMessages[0].content).toBe('Hello specialist!');
  expect(restoredMessages[1].id).toBe('msg-assistant-1');
  expect(restoredMessages[1].content).toBe('Here is the answer.');
  expect(restoredMessages[1].runId).toBe('run-2');

  // Check run history
  expect(reopenedWorkspace.getRun('run-1')?.status).toBe('cancelled');
  expect(reopenedWorkspace.getRun('run-2')?.status).toBe('completed');
});

it('intercepts CopilotKit thread and message endpoints to serve authoritative SQLite data', async () => {
  const store = new Store(':memory:');
  const workspace = new WorkspaceStore(':memory:', 'owner-1');
  resources.push(() => {
    store.close();
    workspace.close();
  });

  const config: PlatformConfig = {
    baseUrl: 'http://127.0.0.1:11434/v1',
    nativeMode: true,
    voiceName: 'marin',
    slackUsers: [],
    runtimeUrl: 'http://localhost/api/copilotkit',
  };

  const platform = new Platform(store, workspace, config);
  const dot = workspace.dots()[0];
  const conversation = await platform.createConversation(dot.id, 'CopilotKit Interception Thread');

  workspace.saveMessage(conversation.id, 'user', 'Saved query', { id: 'msg-1' });
  workspace.saveMessage(conversation.id, 'assistant', 'Saved response', { id: 'msg-2' });

  // Test GET /threads
  const listReq = new Request('http://localhost/api/copilotkit/threads');
  const listRes = await platform.handle(listReq);
  expect(listRes.status).toBe(200);
  const listData = await listRes.json();
  expect(listData.threads).toBeInstanceOf(Array);
  expect(listData.threads.some((t: any) => t.id === conversation.id)).toBe(true);

  // Test GET /threads/:id/messages
  const msgReq = new Request(`http://localhost/api/copilotkit/threads/${conversation.id}/messages`);
  const msgRes = await platform.handle(msgReq);
  expect(msgRes.status).toBe(200);
  const msgData = await msgRes.json();
  expect(msgData.messages).toHaveLength(2);
  expect(msgData.messages[0].id).toBe('msg-1');
  expect(msgData.messages[1].id).toBe('msg-2');

  // Test resource/request envelope format used by CopilotKit client
  const envelopeReq = new Request('http://localhost/api/copilotkit', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      method: 'resource/request',
      params: {
        path: `/threads/${conversation.id}/messages`,
        httpMethod: 'GET',
      },
    }),
  });
  const envelopeRes = await platform.handle(envelopeReq);
  expect(envelopeRes.status).toBe(200);
  const envelopeData = await envelopeRes.json();
  expect(envelopeData.messages).toHaveLength(2);
});

it('preserves Dot backend configuration when renaming a Dot', async () => {
  const workspace = new WorkspaceStore(':memory:', 'owner-1');
  resources.push(() => workspace.close());

  const space = workspace.spaces()[0];
  const dot = workspace.createDot(
    space.id,
    'Custom Agent',
    'Custom instructions',
    true,
    true,
    [space.id],
    null,
    false,
    false,
    [],
    'http://127.0.0.1:11434/v1',
    'coding-agent',
    8192,
    4096,
    'test-key',
  );

  expect(dot.modelEndpoint).toBe('http://127.0.0.1:11434/v1');
  expect(dot.modelId).toBe('coding-agent');
  expect(dot.contextLimit).toBe(8192);
  expect(dot.maxCompletionTokens).toBe(4096);

  // Renaming must not alter backend config
  const updated = workspace.updateDot(dot.id, {
    name: 'Renamed Specialist',
  });

  expect(updated.name).toBe('Renamed Specialist');
  expect(updated.modelEndpoint).toBe('http://127.0.0.1:11434/v1');
  expect(updated.modelId).toBe('coding-agent');
  expect(updated.contextLimit).toBe(8192);
  expect(updated.maxCompletionTokens).toBe(4096);
});

it('executes host commands asynchronously with cancellation and unrestricted paths', async () => {
  const workspace = new WorkspaceStore(':memory:', 'owner-1');
  resources.push(() => workspace.close());

  const dot = workspace.dots()[0];
  workspace.computers.patch(dot.id, { enabled: true, shell: true, files: true });

  const service = new ComputerService(
    workspace,
    {
      baseUrl: '',
      runtimeUrl: '',
      voiceName: 'marin',
      slackUsers: [],
    },
    () => false,
  );

  // Status reports running host computer with truthful capabilities
  const status = await service.status(dot.id);
  expect(status.state).toBe('running');
  expect(status.permissions.shell).toBe(true);
  expect(status.permissions.files).toBe(true);
  expect(status.permissions.browser).toBe(false);

  // Execute a fast PowerShell command
  const res = (await service.action(
    dot.id,
    'exec',
    { command: 'Write-Output "Native PowerShell Execution"' },
    'owner',
  )) as { stdout: string; exitCode: number };
  expect(res.stdout).toContain('Native PowerShell Execution');
  expect(res.exitCode).toBe(0);

  // Test cancellation via AbortSignal
  const controller = new AbortController();
  const cancelPromise = service.action(
    dot.id,
    'exec',
    { command: 'Start-Sleep -Seconds 10' },
    'owner',
    controller.signal,
  );
  // Abort after 50ms
  setTimeout(() => controller.abort(), 50);
  const cancelRes = (await cancelPromise) as { exitCode: number; stderr: string };
  expect(cancelRes.exitCode).toBe(130);
  expect(cancelRes.stderr).toContain('cancelled by signal');
});

it('supports specialist delegation with parent/child run tracking', async () => {
  const workspace = new WorkspaceStore(':memory:', 'owner-1');
  resources.push(() => workspace.close());

  const codingDot = workspace.dots()[0];
  const space = workspace.spaces()[0];
  const researchDot = workspace.createDot(
    space.id,
    'Research Specialist',
    'Investigate technical specs',
    true,
    true,
    [space.id],
  );

  const thread = workspace.bindThread('delegation-thread', codingDot.id, 'Delegation Test');

  // Parent run
  const parentRun = workspace.createRun({
    id: 'parent-run-1',
    threadId: thread.id,
    dotId: codingDot.id,
  });

  // Child delegated run
  const childRun = workspace.createRun({
    id: 'child-run-1',
    threadId: thread.id,
    dotId: researchDot.id,
    parentRunId: parentRun.id,
    metadata: {
      delegation: true,
      fromDotId: codingDot.id,
      fromDotName: codingDot.name,
    },
  });

  expect(childRun.parentRunId).toBe(parentRun.id);
  expect(childRun.metadata).toEqual({
    delegation: true,
    fromDotId: codingDot.id,
    fromDotName: codingDot.name,
  });

  // Tool execution record for delegation
  const toolExec = workspace.createToolExecution({
    runId: parentRun.id,
    threadId: thread.id,
    toolCallId: 'call-delegation-1',
    toolName: 'delegate_task',
    args: { specialist: 'Research Specialist', task: 'Analyze protobuf spec' },
  });

  expect(toolExec.toolName).toBe('delegate_task');
  expect(toolExec.status).toBe('pending');

  workspace.updateToolExecution(toolExec.id, {
    status: 'completed',
    result: { result: 'Analysis completed successfully' },
  });

  const updatedExec = workspace.getToolExecution(toolExec.id);
  expect(updatedExec?.status).toBe('completed');
  expect((updatedExec?.result as any)?.result).toBe(
    'Analysis completed successfully',
  );
});
