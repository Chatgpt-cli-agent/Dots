import { ComputerService } from './computer-service.js';
import { PluginService } from './plugin-service.js';
import { ConnectionService } from './connections.js';
import { PageService } from './page-service.js';
import { randomUUID } from 'node:crypto';
import {
  CopilotKitIntelligence,
  CopilotRuntime,
  createCopilotHonoHandler,
  type CopilotHonoApp,
} from '@copilotkit/runtime/v2';
import { EventType } from '@ag-ui/core';
import { lastValueFrom, toArray, tap } from 'rxjs';
import { NativeAgentRunner } from './native-runner.js';
import { ProtocolAccumulator } from './protocol-accumulator.js';
import { globalRunCoordinator } from './run-coordinator.js';
import { voiceReceiptMessagePrefix } from '../shared/voice-receipt.js';
import { scheduledTaskMessagePrefix } from '../shared/scheduled-message.js';
import { createSlackChannel } from './slack-channel.js';
export { slackIdentity } from './slack-channel.js';
import { Store } from './store.js';
import { WorkspaceStore, formatMessageForAGUI } from './workspace.js';
import { DotAgent } from './dot-agent.js';
import { runThreadTurn } from './headless.js';
import {
  INTELLIGENCE_KEY_MISSING_LABEL,
  setupStatus,
  type PlatformConfig,
} from './platform-config.js';
import { validateRuntimeScope } from './runtime-scope.js';
import { learningSelector } from './learning.js';
import { SetupTelemetry } from './setup-telemetry.js';
export class Platform {
  readonly plugins: PluginService;
  private channelStartupFailed = false;
  readonly setupTelemetry: SetupTelemetry;
  readonly pages: PageService;
  readonly computers: ComputerService;
  readonly connections: ConnectionService;
  readonly intelligence?: CopilotKitIntelligence;
  readonly localIntelligence: {
    createThread(input: { threadId: string; userId: string; agentId: string; name: string }): Promise<unknown>;
    getOrCreateThread(input: { threadId: string; userId: string; agentId: string; name: string }): Promise<unknown>;
    getThreadMessages(input: { threadId: string; userId: string }): Promise<{ messages: { role: string; content?: unknown }[] }>;
  };
  readonly handler?: CopilotHonoApp;
  readonly nativeRunner?: NativeAgentRunner;
  constructor(
    readonly store: Store,
    readonly workspace: WorkspaceStore,
    readonly config: PlatformConfig,
  ) {
    this.setupTelemetry = new SetupTelemetry(store);
    this.plugins = new PluginService(
      workspace.plugins,
      config.pluginDirectory ?? workspace.pluginDirectory,
    );
    this.computers = new ComputerService(
      workspace,
      config,
      () => store.settings().paused,
    );
    this.connections = new ConnectionService(
      workspace.connections,
      undefined,
      undefined,
      workspace.plugins,
    );
    this.plugins.setConnectionService(this.connections);
    this.localIntelligence = {
      async createThread(input) {
        return { id: input.threadId };
      },
      async getOrCreateThread(input) {
        return { id: input.threadId };
      },
      async getThreadMessages(input) {
        return { messages: workspace.getMessages(input.threadId) };
      },
    };
    if (config.intelligenceKey) {
      this.intelligence = new CopilotKitIntelligence({
        apiKey: config.intelligenceKey,
        apiUrl: config.intelligenceApiUrl,
        wsUrl: config.intelligenceWsUrl,
        getLearningContainerId: learningSelector(
          workspace,
          config.slackDotId ?? workspace.dots()[0]?.id,
        ),
      });
    }
    this.pages = new PageService(workspace, () => {
      if (this.intelligence) return this.intelligence;
      if (this.config.nativeMode) return this.localIntelligence;
      this.requireReady();
      return this.intelligence!;
    });
    if (!config.intelligenceKey && !config.nativeMode) return;
    const channels = [];
    if (config.slackChannel && config.slackTeam && config.slackUsers.length) {
      const dotId = config.slackDotId ?? workspace.dots()[0].id;
      if (!workspace.dot(dotId))
        throw new Error('SLACK_DOT_ID does not identify an existing Dot.');
      const slack = createSlackChannel({
        name: config.slackChannel,
        config,
        ownerId: workspace.ownerId,
        paused: () => store.settings().paused,
        agent: () =>
          new DotAgent(
            store,
            workspace,
            config,
            dotId,
            true,
            this.setupTelemetry,
          ),
      });
      channels.push(slack);
    }
    const agents = async () => {
      const entries: [string, DotAgent][] = [];
      for (const dot of workspace.dots()) {
        entries.push([
          dot.id,
          new DotAgent(
            store,
            workspace,
            config,
            dot.id,
            false,
            this.setupTelemetry,
          ),
        ]);
      }
      for (const thread of workspace.conversations()) {
        entries.push([
          `chat-${thread.id}`,
          new DotAgent(
            store,
            workspace,
            config,
            thread.dotId,
            false,
            this.setupTelemetry,
          ),
        ]);
      }
      return Object.fromEntries(entries);
    };
    const nativeRunner = new NativeAgentRunner({
      workspace,
      runCoordinator: globalRunCoordinator,
    });
    this.nativeRunner = nativeRunner;
    const runtime = this.intelligence
      ? new CopilotRuntime({
          intelligence: this.intelligence,
          telemetryId: this.setupTelemetry.identity,
          telemetryProperties: this.setupTelemetry.metadata,
          identifyUser: async () => ({
            id: workspace.ownerId,
            name: 'OpenDots owner',
          }),
          agents,
          channels: channels as any,
          generateThreadNames: true,
        })
      : new (CopilotRuntime as any)({
          runner: nativeRunner,
          telemetryId: this.setupTelemetry.identity,
          telemetryProperties: this.setupTelemetry.metadata,
          identifyUser: async () => ({
            id: workspace.ownerId,
            name: 'OpenDots owner',
          }),
          agents,
          channels: channels as any,
          generateThreadNames: true,
        });
    this.handler = createCopilotHonoHandler({
      runtime,
      basePath: '/api/copilotkit',
      cors: { origin: [] },
    });
  }
  setup() {
    return setupStatus(
      this.config,
      this.handler?.channels?.status().overall ??
        (this.config.slackChannel ? 'setup_required' : 'not_configured'),
      this.channelStartupFailed,
    );
  }
  requireReady() {
    const missing = this.setup().missing;
    if (missing.length)
      throw new Error(
        `Setup required: ${missing.join(', ')}. Conversations require CopilotKit Intelligence.`,
      );
  }
  async start() {
    this.setupTelemetry.start();
    if (this.handler?.channels) {
      try {
        await this.handler.channels.ready({ timeoutMs: 15000 });
        this.channelStartupFailed = false;
      } catch (error) {
        this.channelStartupFailed = true;
        this.setupTelemetry.capture({
          kind: 'setup_failed',
          step: 'settings',
          error_class: 'channel_start_failed',
        });
        throw error;
      }
    }
  }
  async stop() {
    await this.setupTelemetry.stop();
    await this.handler?.channels?.stop();
  }
  async createConversation(dotId: string, title: string) {
    this.requireReady();
    if (!this.workspace.dot(dotId)) throw new Error('Dot not found.');
    const id = randomUUID();
    try {
      await (this.intelligence || this.localIntelligence).createThread({
        threadId: id,
        userId: this.workspace.ownerId,
        agentId: dotId,
        name: title,
      });
    } catch {
      throw new Error(
        'Intelligence could not create this conversation. Check the runtime key and connection.',
      );
    }
    return this.workspace.bindThread(id, dotId, title);
  }
  async history(threadId: string): Promise<string> {
    this.requireReady();
    this.workspace.requireThread(threadId);
    const history = await (this.intelligence || this.localIntelligence).getThreadMessages({
      threadId,
      userId: this.workspace.ownerId,
    });
    return history.messages
      .filter((message) => ['user', 'assistant'].includes(message.role))
      .slice(-12)
      .map(
        (message) =>
          `${message.role}: ${typeof message.content === 'string' ? message.content : ''}`,
      )
      .join('\n')
      .slice(-12000);
  }
  async handleNativeResource(
    request: Request,
    body: any,
  ): Promise<Response | null> {
    const url = new URL(request.url);
    const prefix = '/api/copilotkit';
    let path = '';
    let method = request.method;
    let resourceBody: any = body;

    if (url.pathname.startsWith(`${prefix}/threads`)) {
      path = url.pathname.slice(prefix.length) + url.search;
    } else if (
      body &&
      body.method === 'resource/request' &&
      typeof body.params?.path === 'string'
    ) {
      path = body.params.path;
      method = (body.params.httpMethod || 'GET').toUpperCase();
      resourceBody = body.body;
    }

    if (!path.startsWith('/threads')) return null;

    const [rawPath, search] = path.split('?');
    const searchParams = new URLSearchParams(search || '');

    if (rawPath === '/threads') {
      if (method === 'GET') {
        const agentId = searchParams.get('agentId');
        const includeArchived = searchParams.get('includeArchived') === 'true';
        const threads = this.workspace
          .conversations(includeArchived)
          .filter((t) => {
            if (!agentId) return true;
            if (agentId === t.dotId) return true;
            if (agentId === `chat-${t.id}`) return true;
            return false;
          })
          .map((t) => ({
            id: t.id,
            name: t.title,
            agentId: t.dotId,
            createdAt: new Date(t.createdAt).toISOString(),
            updatedAt: new Date(t.updatedAt ?? t.createdAt).toISOString(),
            archived: Boolean(t.archivedAt),
          }));
        return Response.json({ threads, nextCursor: null });
      }
      if (method === 'POST') {
        const dotId = resourceBody?.agentId || this.workspace.dots()[0]?.id;
        const title = resourceBody?.name || 'A new thought';
        const conv = await this.createConversation(dotId, title);
        return Response.json({
          id: conv.id,
          name: conv.title,
          agentId: conv.dotId,
          createdAt: new Date(conv.createdAt).toISOString(),
          updatedAt: new Date(conv.updatedAt ?? conv.createdAt).toISOString(),
          archived: false,
        });
      }
    }

    const messagesMatch = rawPath.match(/^\/threads\/([^/]+)\/messages$/);
    if (messagesMatch) {
      const threadId = messagesMatch[1];
      if (method === 'GET') {
        const rawMessages = this.workspace.getNativeMessages(threadId);
        const messages = rawMessages.map((m) => ({
          ...formatMessageForAGUI(m),
          createdAt: new Date(m.createdAt).toISOString(),
        }));
        return Response.json({ messages, nextCursor: null });
      }
      if (method === 'POST') {
        const toolCallId =
          resourceBody?.toolCallId || resourceBody?.tool_call_id;
        const msg = this.workspace.saveMessage(
          threadId,
          resourceBody?.role || 'user',
          resourceBody?.content || '',
          {
            id: resourceBody?.id,
            toolCalls: resourceBody?.toolCalls,
            toolCallId,
            metadata: resourceBody?.metadata,
          },
        );
        if (resourceBody?.role === 'tool' && toolCallId) {
          let parsedResult: any = resourceBody?.content;
          if (typeof resourceBody?.content === 'string') {
            try {
              parsedResult = JSON.parse(resourceBody?.content);
            } catch {
              parsedResult = resourceBody?.content;
            }
          }
          const isDeclined =
            parsedResult && typeof parsedResult === 'object'
              ? parsedResult.approved === false ||
                parsedResult.declined === true ||
                parsedResult.rejected === true
              : false;

          this.workspace.resolveToolExecution(threadId, toolCallId, {
            result: parsedResult,
            approved: !isDeclined,
            status: !isDeclined ? 'completed' : 'rejected',
            finishedAt: Date.now(),
          });
        }
        return Response.json(msg);
      }
    }

    const singleMatch = rawPath.match(/^\/threads\/([^/]+)$/);
    if (singleMatch) {
      const threadId = singleMatch[1];
      if (method === 'GET') {
        const thread = this.workspace
          .conversations(true)
          .find((t) => t.id === threadId);
        if (!thread)
          return Response.json({ error: 'Thread not found' }, { status: 404 });
        return Response.json({
          id: thread.id,
          name: thread.title,
          agentId: thread.dotId,
          createdAt: new Date(thread.createdAt).toISOString(),
          updatedAt: new Date(thread.updatedAt ?? thread.createdAt).toISOString(),
          archived: Boolean(thread.archivedAt),
        });
      }
      if (method === 'DELETE') {
        this.workspace.archiveThread(threadId);
        return new Response(null, { status: 204 });
      }
      if (method === 'PATCH') {
        if (resourceBody?.name) {
          this.workspace.updateThreadTitle(threadId, resourceBody.name);
        }
        if (resourceBody?.archived !== undefined) {
          if (resourceBody.archived) {
            this.workspace.archiveThread(threadId);
          } else {
            this.workspace.unarchiveThread(threadId);
          }
        }
        const thread = this.workspace
          .conversations(true)
          .find((t) => t.id === threadId);
        return Response.json({
          id: thread?.id ?? threadId,
          name: thread?.title ?? '',
          agentId: thread?.dotId ?? '',
          createdAt: thread
            ? new Date(thread.createdAt).toISOString()
            : new Date().toISOString(),
          updatedAt: thread
            ? new Date(thread.updatedAt ?? thread.createdAt).toISOString()
            : new Date().toISOString(),
          archived: Boolean(thread?.archivedAt),
        });
      }
    }

    return null;
  }
  async handle(request: Request): Promise<Response> {
    if (!this.handler)
      return Response.json(
        { error: `Setup required: ${INTELLIGENCE_KEY_MISSING_LABEL}.` },
        { status: 503 },
      );
    let body: unknown;
    if (request.method !== 'GET' && request.method !== 'HEAD')
      body = await request
        .clone()
        .json()
        .catch(() => null);
    try {
      validateRuntimeScope(request, this.workspace, body);
    } catch (error) {
      return Response.json(
        {
          error:
            error instanceof Error
              ? error.message
              : 'Conversation scope denied.',
        },
        { status: 403 },
      );
    }
    const nativeRes = await this.handleNativeResource(request, body);
    if (nativeRes) return nativeRes;
    return this.handler.fetch(request);
  }
  async runNativeTurn(
    threadId: string,
    prompt: string,
    signal: AbortSignal,
    metadata?: Record<string, unknown>,
  ): Promise<string> {
    this.requireReady();
    signal.throwIfAborted();
    const thread = this.workspace.requireThread(threadId);

    // Cancel active runs for this thread (one active run per thread)
    this.workspace.cancelActiveRuns(threadId);

    const idPrefix =
      metadata?.opendotsSource === 'voice_receipt'
        ? voiceReceiptMessagePrefix
        : metadata?.opendotsSource === 'scheduled_task'
          ? scheduledTaskMessagePrefix
          : '';
    const userMsgId = `${idPrefix}${randomUUID()}`;

    // 1. Persist incoming message before execution
    this.workspace.saveMessage(threadId, 'user', prompt, {
      id: userMsgId,
      metadata,
    });

    // 2. Create native run record
    const run = this.workspace.createRun({
      threadId,
      dotId: thread.dotId,
      metadata,
    });

    // 3. Load authoritative history from SQLite
    const history = this.workspace.getNativeMessages(threadId).map((m) => ({
      id: m.id,
      role: m.role,
      content: m.content,
    }));

    // 4. Instantiate DotAgent
    const agent = new DotAgent(
      this.store,
      this.workspace,
      this.config,
      thread.dotId,
      false,
      this.setupTelemetry,
    );

    const accumulator = new ProtocolAccumulator();
    const abortHandler = () => {
      globalRunCoordinator.cancelThread(threadId, 'Turn cancelled by abort signal');
      agent.abortRun();
    };
    signal.addEventListener('abort', abortHandler, { once: true });

    try {
      signal.throwIfAborted();
      await lastValueFrom(
        agent
          .run({
            runId: run.id,
            threadId,
            messages: history as any,
            tools: [],
            context: [],
            state: {},
            forwardedProps: {},
          })
          .pipe(
            tap((ev) => accumulator.processEvent(ev)),
            toArray(),
          ),
      );
      signal.throwIfAborted();

      if (accumulator.hasError()) {
        throw accumulator.getError()!;
      }

      const assistantText = accumulator.getAssistantText();
      if (!assistantText.trim()) {
        throw new Error(
          'The current compute turn returned no assistant response.',
        );
      }

      this.workspace.updateRun(run.id, {
        status: 'completed',
        finishedAt: Date.now(),
      });
      this.workspace.touchThread(threadId);
      return assistantText;
    } catch (error) {
      if (signal.aborted) {
        this.workspace.updateRun(run.id, {
          status: 'cancelled',
          finishedAt: Date.now(),
        });
      } else {
        this.workspace.updateRun(run.id, {
          status: 'failed',
          error: error instanceof Error ? error.message : String(error),
          finishedAt: Date.now(),
        });
      }
      throw error;
    } finally {
      signal.removeEventListener('abort', abortHandler);
    }
  }
  async turn(
    threadId: string,
    prompt: string,
    signal: AbortSignal,
    metadata?: Record<string, unknown>,
  ): Promise<string> {
    this.requireReady();
    if (this.config.nativeMode || !this.intelligence) {
      return this.runNativeTurn(threadId, prompt, signal, metadata);
    }
    const thread = this.workspace.requireThread(threadId);
    return runThreadTurn(
      this.config.runtimeUrl,
      this.config.ownerToken
        ? { Authorization: `Bearer ${this.config.ownerToken}` }
        : {},
      thread.dotId,
      threadId,
      prompt,
      signal,
      metadata,
    );
  }
}
