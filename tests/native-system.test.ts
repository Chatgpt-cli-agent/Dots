import { afterEach, expect, it, vi } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { Store } from '../src/server/store.js';
import { WorkspaceStore } from '../src/server/workspace.js';
import { Platform } from '../src/server/platform.js';
import { ComputerService } from '../src/server/computer-service.js';
import { EventType } from '@ag-ui/core';
import { lastValueFrom, toArray } from 'rxjs';
import { ProtocolAccumulator } from '../src/server/protocol-accumulator.js';
import { NativeAgentRunner } from '../src/server/native-runner.js';
import { RunCoordinator, globalRunCoordinator } from '../src/server/run-coordinator.js';
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

it('accumulates AG-UI text delta events, tool events, and preserves message IDs and boundaries', () => {
  const accumulator = new ProtocolAccumulator();

  // 1. Text message with deltas (the AG-UI standard)
  accumulator.processEvent({
    type: EventType.TEXT_MESSAGE_START,
    messageId: 'msg-assist-1',
    role: 'assistant',
  } as any);
  accumulator.processEvent({
    type: EventType.TEXT_MESSAGE_CONTENT,
    messageId: 'msg-assist-1',
    delta: 'Hello, ',
  } as any);
  accumulator.processEvent({
    type: EventType.TEXT_MESSAGE_CHUNK,
    messageId: 'msg-assist-1',
    delta: 'I am your specialist.',
  } as any);
  accumulator.processEvent({
    type: EventType.TEXT_MESSAGE_END,
    messageId: 'msg-assist-1',
  } as any);

  // 2. Tool call events
  accumulator.processEvent({
    type: EventType.TOOL_CALL_START,
    toolCallId: 'tc-1',
    toolCallName: 'read_space_page',
    parentMessageId: 'msg-assist-1',
  } as any);
  accumulator.processEvent({
    type: EventType.TOOL_CALL_ARGS,
    toolCallId: 'tc-1',
    delta: '{"pageId":"p-123"}',
  } as any);
  accumulator.processEvent({
    type: EventType.TOOL_CALL_END,
    toolCallId: 'tc-1',
  } as any);
  accumulator.processEvent({
    type: EventType.TOOL_CALL_RESULT,
    toolCallId: 'tc-1',
    messageId: 'msg-tool-1',
    content: 'Page contents: System Architecture',
  } as any);

  // 3. Complete run
  accumulator.processEvent({
    type: EventType.RUN_FINISHED,
  } as any);

  expect(accumulator.isDone()).toBe(true);
  expect(accumulator.hasError()).toBe(false);
  expect(accumulator.getAssistantText()).toBe('Hello, I am your specialist.');

  const messages = accumulator.getMessages();
  expect(messages).toHaveLength(2);
  expect(messages[0].id).toBe('msg-assist-1');
  expect(messages[0].role).toBe('assistant');
  expect(messages[0].content).toBe('Hello, I am your specialist.');
  expect(messages[0].toolCalls?.[0].id).toBe('tc-1');
  expect(messages[0].toolCalls?.[0].function.name).toBe('read_space_page');

  expect(messages[1].id).toBe('msg-tool-1');
  expect(messages[1].role).toBe('tool');
  expect(messages[1].content).toBe('Page contents: System Architecture');
  expect(messages[1].toolCallId).toBe('tc-1');

  const toolCalls = accumulator.getToolCalls();
  expect(toolCalls).toHaveLength(1);
  expect(toolCalls[0].toolCallId).toBe('tc-1');
  expect(toolCalls[0].status).toBe('completed');
  expect(toolCalls[0].result).toBe('Page contents: System Architecture');
});

it('reconnects and replays durable SQLite history and pending approvals via NativeAgentRunner after server restart', async () => {
  const dbPath = createTestDbPath();
  const workspace1 = new WorkspaceStore(dbPath, 'owner-1');
  resources.push(() => workspace1.close());

  const dot = workspace1.dots()[0];
  const thread = workspace1.bindThread('thread-restart-1', dot.id, 'Restart Thread');

  // Populate history in SQLite
  workspace1.saveMessage(thread.id, 'user', 'What is the deployment plan?', {
    id: 'msg-user-10',
  });
  workspace1.saveMessage(thread.id, 'assistant', 'Here is the plan: deploy to prod.', {
    id: 'msg-asst-10',
  });

  // Create run and a pending approval tool execution
  const run = workspace1.createRun({
    id: 'run-approval-1',
    threadId: thread.id,
    dotId: dot.id,
  });
  workspace1.createToolExecution({
    id: 'exec-approval-1',
    runId: run.id,
    threadId: thread.id,
    toolCallId: 'call-deploy-1',
    toolName: 'request_connection_action',
    args: { action: 'deploy', target: 'production' },
    approvalRequired: true,
  });

  // Close first workspace store (simulating server shutdown)
  workspace1.close();

  // Create a completely fresh workspace store & runner on the existing database (simulating server restart)
  const workspace2 = new WorkspaceStore(dbPath, 'owner-1');
  resources.push(() => workspace2.close());
  const coordinator = new RunCoordinator();
  const nativeRunner = new NativeAgentRunner({ workspace: workspace2, runCoordinator: coordinator });

  // Connect to the thread via native runner (as the browser frontend does via copilotkit.connectAgent)
  const events = await lastValueFrom(
    nativeRunner.connect({ threadId: thread.id }).pipe(toArray()),
  );

  // 1. MESSAGES_SNAPSHOT event emitted with authoritative history
  const snapshotEvent = events.find((e: any) => e.type === EventType.MESSAGES_SNAPSHOT) as any;
  expect(snapshotEvent).toBeDefined();
  expect(snapshotEvent.messages).toHaveLength(2);
  expect(snapshotEvent.messages[0]).toMatchObject({
    id: 'msg-user-10',
    role: 'user',
    content: 'What is the deployment plan?',
  });
  expect(snapshotEvent.messages[1]).toMatchObject({
    id: 'msg-asst-10',
    role: 'assistant',
    content: 'Here is the plan: deploy to prod.',
  });

  // 2. Pending approval interrupt event emitted
  const interruptEvent = events.find(
    (e: any) => e.type === EventType.RUN_FINISHED && e.outcome?.type === 'interrupt',
  ) as any;
  expect(interruptEvent).toBeDefined();
  expect(interruptEvent.outcome.interrupts[0]).toMatchObject({
    id: 'exec-approval-1',
    name: 'request_connection_action',
    toolCallId: 'call-deploy-1',
  });
});

it('coordinates atomic run cancellation and guards against terminal status overwrites', () => {
  const workspace = new WorkspaceStore(':memory:', 'owner-1');
  resources.push(() => workspace.close());

  const dot = workspace.dots()[0];
  const thread = workspace.bindThread('thread-cancel-test', dot.id, 'Cancel Thread');
  const coordinator = new RunCoordinator();

  const controller1 = new AbortController();
  let agent1Aborted = false;
  const mockAgent1 = { abortRun: () => { agent1Aborted = true; } };

  // 1. Register run 1
  coordinator.register(thread.id, 'run-active-1', dot.id, controller1, mockAgent1);
  const run1 = workspace.createRun({ id: 'run-active-1', threadId: thread.id, dotId: dot.id });
  expect(coordinator.isThreadActive(thread.id)).toBe(true);

  // 2. Cancel run 1 via coordinator
  const didCancel = coordinator.cancelThread(thread.id, 'User cancelled');
  expect(didCancel).toBe(true);
  expect(controller1.signal.aborted).toBe(true);
  expect(agent1Aborted).toBe(true);
  expect(coordinator.isThreadActive(thread.id)).toBe(false);

  workspace.updateRun(run1.id, {
    status: 'cancelled',
    finishedAt: Date.now(),
  });
  expect(workspace.getRun(run1.id)?.status).toBe('cancelled');

  // 3. Late arriving event/callback cannot overwrite cancelled terminal status
  workspace.updateRun(run1.id, {
    status: 'completed',
    finishedAt: Date.now(),
  });
  expect(workspace.getRun(run1.id)?.status).toBe('cancelled');

  workspace.updateRun(run1.id, {
    status: 'running',
  });
  expect(workspace.getRun(run1.id)?.status).toBe('cancelled');

  // 4. Calling createRun on an existing cancelled run does not resurrect it
  const reCreated = workspace.createRun({ id: run1.id, threadId: thread.id, dotId: dot.id, status: 'running' });
  expect(reCreated.status).toBe('cancelled');
});

it('supports per-Dot model configuration and sanitizes stored API keys', () => {
  const workspace = new WorkspaceStore(':memory:', 'owner-1');
  resources.push(() => workspace.close());

  const space = workspace.spaces()[0];
  const customDot = workspace.createDot(
    space.id,
    'Local Specialist',
    'Execute tasks with local endpoint',
    true,
    true,
    [space.id],
    undefined,
    false,
    true,
    [],
    'http://192.168.1.100:11434/v1',
    'qwen2.5-coder:32b',
    16384,
    4096,
    'secret-token-12345',
  );

  // Dot configuration is persisted
  expect(customDot.modelEndpoint).toBe('http://192.168.1.100:11434/v1');
  expect(customDot.modelId).toBe('qwen2.5-coder:32b');
  expect(customDot.contextLimit).toBe(16384);
  expect(customDot.maxCompletionTokens).toBe(4096);

  // Public dots() listing strips secrets and sets hasApiKey flag
  const publicDots = workspace.dots(false);
  const publicCustom = publicDots.find((d) => d.id === customDot.id);
  expect(publicCustom).toBeDefined();
  expect(publicCustom?.apiKey).toBeUndefined();
  expect(publicCustom?.hasApiKey).toBe(true);

  // Internal dot() retrieval preserves apiKey for model execution
  const internalCustom = workspace.dot(customDot.id, true);
  expect(internalCustom?.apiKey).toBe('secret-token-12345');

  // Updating the Dot preserves endpoints and apiKey
  const updated = workspace.updateDot(customDot.id, {
    name: 'Renamed Specialist', // Renaming must not break backend
    contextLimit: 32768,
    apiKey: 'new-secret-999',
  });
  expect(updated.name).toBe('Renamed Specialist');
  expect(updated.modelEndpoint).toBe('http://192.168.1.100:11434/v1');
  expect(updated.contextLimit).toBe(32768);
  expect(workspace.dot(customDot.id, true)?.apiKey).toBe('new-secret-999');
});

