import { parallelSources } from './parallel.js';
import { pageReviewTool } from '../shared/page-review.js';
import { ComputerService } from './computer-service.js';
import { computerTools } from './computer-tools.js';
import { ConnectionService } from './connections.js';
import { connectionTools } from './connection-tools.js';
import { connectionActionTool } from '../shared/connection-types.js';
import { composioSession } from './composio.js';
import { composioTools } from './composio-tools.js';
import { pageAccess, pageTools } from './page-tools.js';
import {
  skillsTools,
  matchAndLoadRelevantSkills,
  getCompactSkillCatalog,
} from './skills-service.js';
import { AbstractAgent } from '@ag-ui/client';
import { type BaseEvent, type RunAgentInput, EventType } from '@ag-ui/core';
import {
  BuiltInAgent,
  type ToolDefinition,
  defineTool,
  convertInputToTanStackAI,
} from '@copilotkit/runtime/v2';
import { chat, maxIterations } from '@tanstack/ai';
import { openaiCompatibleText } from '@tanstack/ai-openai/compatible';
import { learnedSkillTools, tanstackTools } from './tanstack-tools.js';
import { randomUUID } from 'node:crypto';
import { Observable, lastValueFrom, toArray, tap } from 'rxjs';
import { globalRunCoordinator } from './run-coordinator.js';
import { ProtocolAccumulator } from './protocol-accumulator.js';
import { z } from 'zod';
import { Store } from './store.js';
import { WorkspaceStore } from './workspace.js';
import {
  DEFAULT_AGENT_RUN_TIMEOUT_MS,
  type PlatformConfig,
} from './platform-config.js';
import { browserResponse } from './research.js';
import { answerObserver, type SetupTelemetry } from './setup-telemetry.js';
const channelError = () => ({
  type: EventType.RUN_ERROR,
  message:
    'OpenDots could not complete this request. Please check the app and try again.',
});
export class DotAgent extends AbstractAgent {
  private inner?: BuiltInAgent;
  private controller?: AbortController;
  constructor(
    private store: Store,
    private workspace: WorkspaceStore,
    private config: PlatformConfig,
    private dotId: string,
    private channel = false,
    private setupTelemetry?: SetupTelemetry,
  ) {
    super({ agentId: dotId });
  }
  clone() {
    return new DotAgent(
      this.store,
      this.workspace,
      this.config,
      this.dotId,
      this.channel,
      this.setupTelemetry,
    );
  }
  abortRun() {
    this.controller?.abort();
    this.inner?.abortRun();
  }
  run(input: RunAgentInput): Observable<BaseEvent> {
    return new Observable((subscriber) => {
      const controller = new AbortController();
      this.controller = controller;
      let subscription: { unsubscribe(): void } | undefined;
      let watcher: ReturnType<typeof setInterval> | undefined;
      let finished = false;
      let configurationFailure = false;
      let runRecord: any;
      const turnTimeLimitMs =
        this.config.agentRunTimeoutMs ?? DEFAULT_AGENT_RUN_TIMEOUT_MS;
      const observe = answerObserver((event) =>
        this.setupTelemetry?.capture(event),
      );
      const timeLimitError = () => ({
        type: EventType.RUN_ERROR,
        message: `This turn reached the ${turnTimeLimitMs / 1000} second time limit and was stopped. Try a smaller request.`,
      });
      const timeout = setTimeout(() => {
        observe({ type: EventType.RUN_ERROR });
        subscriber.next(this.channel ? channelError() : timeLimitError());
        subscriber.complete();
      }, turnTimeLimitMs);
      const fail = (error: unknown) => {
        if (runRecord) {
          try {
            this.workspace.updateRun(runRecord.id, {
              status: controller.signal.aborted ? 'cancelled' : 'failed',
              error: error instanceof Error ? error.message : String(error),
              finishedAt: Date.now(),
            });
          } catch {}
        }
        if (subscriber.closed) return;
        if (!configurationFailure) observe({ type: EventType.RUN_ERROR });
        subscriber.next(
          this.channel
            ? channelError()
            : {
                type: EventType.RUN_ERROR,
                message:
                  error instanceof Error
                    ? error.message
                    : 'Dot could not start.',
              },
        );
        subscriber.complete();
      };
      try {
        const dot = this.workspace.dot(this.dotId);
        if (!dot) throw new Error('Specialist Dot not found.');
        if (
          this.channel &&
          !this.workspace
            .conversations()
            .some((thread) => thread.id === input.threadId)
        )
          this.workspace.bindThread(
            input.threadId,
            dot.id,
            'Slack conversation',
          );
        const conversation = this.workspace.requireThread(
          input.threadId,
          dot.id,
        );

        // Atomic run ownership & cancellation coordination
        this.workspace.cancelActiveRuns(input.threadId, undefined, input.runId);
        globalRunCoordinator.register(input.threadId, input.runId, dot.id, controller, this);

        // Persist incoming messages before execution
        if (Array.isArray(input.messages)) {
          const existingMessages = this.workspace.getNativeMessages(input.threadId);
          for (const msg of input.messages) {
            if (msg.role === 'user' || msg.role === 'assistant' || msg.role === 'tool') {
              const text =
                typeof msg.content === 'string'
                  ? msg.content
                  : JSON.stringify(msg.content ?? '');
              const toolCallId = (msg as any).toolCallId || (msg as any).tool_call_id;
              const alreadySaved = existingMessages.some(
                (m) =>
                  (msg.id && m.id === msg.id) ||
                  (m.role === msg.role && m.content === text),
              );
              if (!alreadySaved) {
                this.workspace.saveMessage(input.threadId, msg.role, text, {
                  id: msg.id,
                  toolCallId,
                  toolCalls: (msg as any).toolCalls,
                });
              }

              // Atomically and idempotently resolve durable tool execution when tool result message arrives
              if (msg.role === 'tool' && toolCallId) {
                let parsedResult: any = msg.content;
                if (typeof msg.content === 'string') {
                  try {
                    parsedResult = JSON.parse(msg.content);
                  } catch {
                    parsedResult = msg.content;
                  }
                }
                const isDeclined =
                  parsedResult && typeof parsedResult === 'object'
                    ? parsedResult.approved === false ||
                      parsedResult.declined === true ||
                      parsedResult.rejected === true
                    : false;

                this.workspace.resolveToolExecution(input.threadId, toolCallId, {
                  result: parsedResult,
                  approved: !isDeclined,
                  status: !isDeclined ? 'completed' : 'rejected',
                  finishedAt: Date.now(),
                });
              }
            }
          }
        }

        runRecord = this.workspace.createRun({
          id: input.runId,
          threadId: input.threadId,
          dotId: dot.id,
          status: 'running',
        });
        const effectiveModel = dot.modelId || this.config.model;
        if (!effectiveModel) {
          configurationFailure = true;
          this.setupTelemetry?.capture({
            kind: 'setup_failed',
            step: 'setup_required',
            error_class: 'configuration_missing',
          });
          throw new Error('Model configuration is required.');
        }
        const initialSettings = this.store.settings();
        const initialConnections = this.workspace.connections.fingerprint(
          dot.id,
        );
        const check = () => {
          const settings = this.store.settings();
          const current = this.workspace.dot(dot.id);
          if (
            settings.paused ||
            !current ||
            settings.researchAllowed !== initialSettings.researchAllowed ||
            settings.memoryAllowed !== initialSettings.memoryAllowed ||
            settings.appsAllowed !== initialSettings.appsAllowed ||
            current.memoryAllowed !== dot.memoryAllowed ||
            current.learningContainerId !== dot.learningContainerId ||
            current.skillDeliveryEnabled !== dot.skillDeliveryEnabled ||
            current.researchAllowed !== dot.researchAllowed ||
            current.appsAllowed !== dot.appsAllowed ||
            JSON.stringify(current.composioToolkits) !==
              JSON.stringify(dot.composioToolkits) ||
            current.spaceId !== dot.spaceId ||
            this.workspace.connections.fingerprint(dot.id) !==
              initialConnections ||
            JSON.stringify(current.spaceIds) !== JSON.stringify(dot.spaceIds)
          )
            this.abortRun();
          controller.signal.throwIfAborted();
        };
        check();
        watcher = setInterval(() => {
          try {
            check();
          } catch {
            this.abortRun();
          }
        }, 100);
        const computer = new ComputerService(
          this.workspace,
          this.config,
          () => this.store.settings().paused,
        );
        const tools: ToolDefinition[] =
          dot.researchAllowed &&
          initialSettings.researchAllowed &&
          this.config.webSearchProvider === 'browser' &&
          !computer.configured
            ? [
                defineTool({
                  name: 'read_public_page',
                  description:
                    'Read a provided canonical public HTTP(S) URL in a separate read-only browser, returning source evidence. No web search, redirects, authenticated sites, or write actions.',
                  parameters: z.object({ url: z.string().url().max(2048) }),
                  execute: async ({ url }) => {
                    check();
                    if (!this.store.settings().researchAllowed)
                      throw new Error('Research permission is disabled.');
                    if (!this.config.browserUrl || !this.config.browserSecret)
                      throw new Error(
                        'Browser is not configured: set BROWSER_URL and BROWSER_SECRET.',
                      );
                    const response = await fetch(
                      `${this.config.browserUrl.replace(/\/$/, '')}/browse`,
                      {
                        method: 'POST',
                        headers: {
                          'Content-Type': 'application/json',
                          Authorization: `Bearer ${this.config.browserSecret}`,
                        },
                        body: JSON.stringify({ url }),
                        signal: controller.signal,
                      },
                    );
                    if (!response.ok)
                      throw new Error(
                        `Browser returned HTTP ${response.status}. Provide a public canonical page URL; redirects and private addresses are blocked.`,
                      );
                    const page = browserResponse.parse(await response.json());
                    check();
                    this.workspace.saveCapture(input.threadId, {
                      sample: false,
                      text: page.text,
                      sources: [
                        {
                          title: page.title,
                          url: page.url,
                          excerpt: page.text.slice(0, 320),
                        },
                      ],
                      screenshot: page.screenshot,
                    });
                    return {
                      title: page.title,
                      url: page.url,
                      text: page.text.slice(0, 24000),
                    };
                  },
                }),
              ]
            : [];
        if (
          dot.researchAllowed &&
          initialSettings.researchAllowed &&
          (this.config.webSearchProvider ?? 'parallel') === 'parallel'
        ) {
          const capture = async (
            objective: string,
            urls?: string[],
            searchQueries?: string[],
          ) => {
            const limitations: string[] = [];
            check();
            const sources = await parallelSources(
              {
                objective,
                urls,
                sessionId: input.threadId,
                searchQueries,
                onWarning: (message) => limitations.push(message),
              },
              this.config,
              controller.signal,
            );
            check();
            this.workspace.saveCapture(input.threadId, {
              sample: false,
              text:
                sources
                  .map((page) => `${page.title}\n${page.url}\n${page.text}`)
                  .join('\n\n') +
                (limitations.length
                  ? `\n\nSource limitations: ${limitations.join(' ')}`
                  : ''),
              sources: sources.map((page) => ({
                title: page.title,
                url: page.url,
                excerpt: page.text.slice(0, 320),
              })),
            });
            return { sources, limitations };
          };
          tools.push(
            defineTool({
              name: 'search_web',
              description:
                'Search public web sources and read relevant excerpts for a research question. Return source URLs for citations. Sends the question to Parallel.',
              parameters: z.object({
                objective: z.string().optional().describe('Research question or topic to search for.'),
                query: z.string().optional().describe('Search keywords.'),
                search_queries: z
                  .array(z.string())
                  .optional()
                  .describe('Keyword queries.'),
              }),
              execute: (input: any) => {
                const obj = input?.objective || input?.query || (Array.isArray(input?.search_queries) ? input.search_queries[0] : 'Sims 4 research');
                const sq = Array.isArray(input?.search_queries) && input.search_queries.length ? input.search_queries : [obj];
                return capture(obj, undefined, sq);
              },
            }),
            defineTool({
              name: 'read_public_page',
              description:
                'Extract source evidence from a public HTTP(S) URL with Parallel. No authenticated browsing or write actions.',
              parameters: z.object({ url: z.string().url().max(2048) }),
              execute: ({ url }) =>
                capture('Read the page for relevant source evidence.', [url]),
            }),
          );
        }
        // Owner approval happens in the web app's chat, so channel turns and
        // headless runs cannot use approval-gated connection tools.
        const clientTools = this.channel
          ? []
          : input.tools.filter((tool) =>
              [pageReviewTool.name, connectionActionTool.name].includes(
                tool.name,
              ),
            );
        const approvals = clientTools.some(
          (tool) => tool.name === connectionActionTool.name,
        );
        const connected = connectionTools(
          new ConnectionService(this.workspace.connections),
          dot.id,
          input.threadId,
          check,
          controller.signal,
          approvals,
        );
        const pages = pageAccess(
          this.workspace,
          dot.spaceId,
          input.threadId,
          check,
        );
        const pageContext = pages.context();
        const memories =
          initialSettings.memoryAllowed && dot.memoryAllowed
            ? this.store.memories().map((memory) => memory.text)
            : [];
        const dotBaseUrl =
          dot.modelEndpoint || this.config.baseUrl || 'http://127.0.0.1:11434/v1';
        const dotModel = dot.modelId || this.config.model || 'qwen2.5-coder:14b';
        const maxTokens = dot.maxCompletionTokens ?? 2200;
        const dotApiKey = dot.apiKey || this.config.apiKey || 'local';
        const adapter = openaiCompatibleText(dotModel, {
          apiKey: dotApiKey,
          baseURL: dotBaseUrl,
          api: 'chat-completions',
          maxRetries: 1,
        });
        const start = async () => {
          let capturedUserText = '';
          const appTools =
            this.config.composioApiKey &&
            initialSettings.appsAllowed &&
            dot.appsAllowed
              ? await composioTools(
                  await composioSession(
                    this.config,
                    this.workspace,
                    dot,
                    this.workspace.ownerId,
                    controller.signal,
                  ),
                  check,
                  controller.signal,
                )
              : [];
          check();

          const delegationTool = defineTool({
            name: 'delegate_task',
            description:
              'Delegate a task to another specialist Dot (e.g. Coding Agent, Research Agent, Little Man) and await their results.',
            parameters: z.object({
              specialist: z
                .string()
                .describe(
                  'Name or ID of the specialist Dot (e.g. "Research Agent", "Coding Agent", "Little Man")',
                ),
              task: z
                .string()
                .describe('Detailed instructions for the specialist to execute'),
            }),
            execute: async ({ specialist, task }) => {
              check();
              const target = this.workspace
                .dots()
                .find(
                  (d) =>
                    d.id === specialist ||
                    d.name.toLowerCase() === specialist.toLowerCase() ||
                    d.name.toLowerCase().includes(specialist.toLowerCase()),
                );
              if (!target)
                throw new Error(`Specialist Dot "${specialist}" not found.`);
              if (target.id === dot.id)
                throw new Error('Cannot delegate a task to yourself.');

              const subThreadId = `delegation-${runRecord.id}-${randomUUID()}`;
              this.workspace.bindThread(
                subThreadId,
                target.id,
                `Delegation from ${dot.name}: ${task.slice(0, 30)}`,
              );
              this.workspace.saveMessage(subThreadId, 'user', task);

              const subRun = this.workspace.createRun({
                threadId: subThreadId,
                dotId: target.id,
                parentRunId: runRecord.id,
                metadata: {
                  delegation: true,
                  fromDotId: dot.id,
                  fromDotName: dot.name,
                  parentRunId: runRecord.id,
                },
              });

              const delegationExec = this.workspace.createToolExecution({
                runId: runRecord.id,
                threadId: input.threadId,
                toolName: 'delegate_task',
                args: { specialist: target.name, task },
              });

              const subAgent = new DotAgent(
                this.store,
                this.workspace,
                this.config,
                target.id,
                false,
                this.setupTelemetry,
              );

              const subAbort = () => {
                subAgent.abortRun();
                this.workspace.updateRun(subRun.id, {
                  status: 'cancelled',
                  finishedAt: Date.now(),
                });
                this.workspace.updateToolExecution(delegationExec.id, {
                  status: 'failed',
                  error: 'Delegation cancelled',
                  finishedAt: Date.now(),
                });
              };
              controller.signal.addEventListener('abort', subAbort, {
                once: true,
              });

              try {
                const subAccumulator = new ProtocolAccumulator();
                await lastValueFrom(
                  subAgent
                    .run({
                      runId: subRun.id,
                      threadId: subThreadId,
                      messages: [{ id: randomUUID(), role: 'user', content: task }] as any,
                      tools: [],
                      context: [],
                      state: {},
                      forwardedProps: {},
                    })
                    .pipe(
                      tap((ev) => subAccumulator.processEvent(ev)),
                      toArray(),
                    ),
                );

                if (subAccumulator.hasError()) {
                  const err = subAccumulator.getError()!;
                  this.workspace.updateToolExecution(delegationExec.id, {
                    status: 'failed',
                    error: err.message,
                    finishedAt: Date.now(),
                  });
                  this.workspace.updateRun(subRun.id, {
                    status: 'failed',
                    error: err.message,
                    finishedAt: Date.now(),
                  });
                  throw err;
                }

                const childText = subAccumulator.getAssistantText();
                if (!childText.trim()) {
                  const err = new Error(
                    'Specialist completed without returning any output.',
                  );
                  this.workspace.updateToolExecution(delegationExec.id, {
                    status: 'failed',
                    error: err.message,
                    finishedAt: Date.now(),
                  });
                  this.workspace.updateRun(subRun.id, {
                    status: 'failed',
                    error: err.message,
                    finishedAt: Date.now(),
                  });
                  throw err;
                }

                this.workspace.updateToolExecution(delegationExec.id, {
                  status: 'completed',
                  result: { result: childText },
                  finishedAt: Date.now(),
                });
                this.workspace.updateRun(subRun.id, {
                  status: 'completed',
                  finishedAt: Date.now(),
                });
                return {
                  specialist: target.name,
                  result: childText,
                };
              } catch (err: any) {
                this.workspace.updateToolExecution(delegationExec.id, {
                  status: 'failed',
                  error: err.message,
                  finishedAt: Date.now(),
                });
                this.workspace.updateRun(subRun.id, {
                  status: controller.signal.aborted ? 'cancelled' : 'failed',
                  error: err.message,
                  finishedAt: Date.now(),
                });
                throw err;
              } finally {
                controller.signal.removeEventListener('abort', subAbort);
              }
            },
          });

          const serverTools = [
            ...tools,
            delegationTool,
            ...skillsTools(check),
            ...appTools,
            ...pageTools(pages),
            ...(computer.configured
              ? computerTools(computer, dot.id, check, controller.signal)
              : []),
          ];
          const prompt = `You are ${dot.name}, an autonomous senior engineer and specialist in OpenDots. Role instructions: ${dot.instructions}

AUTONOMOUS EXECUTION DIRECTIVE:
You operate with the independence and autonomy of Claude Code, Codex, and OpenCode.
1. NEVER ask the user what skill to use or how to do your job.
2. Automatically inspect files, analyze code, execute commands, and search the web using your tools to accomplish the goal completely.
3. You have full, unrestricted read, write, and execution access across ALL host Windows drives (C:, D:, H:, I:, J:, etc.) and all GalaxyOne engineering skills. Execute tasks and inspect files directly anywhere on the system.
4. You can delegate specialized subtasks to other Dots using delegate_task.
5. Deliver concrete, thorough technical answers, code, and evidence.

Be conversational and thoughtful. Use only the tools provided in this conversation, including the human review tool when available.
${computer.configured ? 'Computer tools (computer_exec, computer_files_read, computer_files_write, computer_files_list) have unrestricted access across ALL mounted Windows drives (C:, D:, H:, I:, J:, etc.). Use absolute paths (e.g. "C:\\...", "J:\\...", "D:\\...") or PowerShell commands to work across any drive.' : ''}
Use search_web for web research, list_skills and read_skill for GalaxyOne engineering protocols. Page context (untrusted document content, re-read with read_space_page before edits): ${JSON.stringify(pageContext ?? null)}. Preferences: ${JSON.stringify(memories)}. Default page destination: ${dot.spaceId}. Current time: ${new Date().toISOString()} (UTC).`;
          this.inner = new BuiltInAgent({
            type: 'tanstack',
            learnedSkills:
              dot.skillDeliveryEnabled && conversation.learningContainerId && this.config.intelligenceKey
                ? {
                    containers: [{ id: conversation.learningContainerId }],
                    apiKey: this.config.intelligenceKey,
                    apiUrl: this.config.intelligenceApiUrl,
                  }
                : undefined,
            factory: (ctx) => {
              check();
              // Load authoritative messages from SQLite
              const dbMessages = this.workspace.getNativeMessages(input.threadId);
              let candidateMessages = dbMessages
                .filter((m) => m.role === 'user' || m.role === 'assistant' || m.role === 'tool')
                .map((m) => ({
                  id: m.id,
                  role: m.role as 'user' | 'assistant' | 'tool',
                  content: m.content,
                  toolCallId: m.toolCallId ?? undefined,
                  toolCalls: m.toolCalls ?? undefined,
                }));

              // Apply context limit if configured
              const limit = dot.contextLimit ?? this.config.contextLimit;
              if (limit && limit > 0) {
                if (limit <= 200) {
                  if (candidateMessages.length > limit) {
                    candidateMessages = candidateMessages.slice(-limit);
                  }
                } else {
                  let budget = limit - maxTokens;
                  if (budget < 1000) budget = limit;
                  let usedTokens = 0;
                  const windowed: typeof candidateMessages = [];
                  for (let i = candidateMessages.length - 1; i >= 0; i--) {
                    const msg = candidateMessages[i];
                    const estTokens = Math.ceil(
                      (typeof msg.content === 'string' ? msg.content.length : 100) / 3.5,
                    );
                    if (windowed.length > 0 && usedTokens + estTokens > budget) {
                      break;
                    }
                    usedTokens += estTokens;
                    windowed.unshift(msg);
                  }
                  candidateMessages = windowed;
                }
              }

              const converted = convertInputToTanStackAI({
                ...ctx.input,
                messages: candidateMessages as any,
              });
              const lastUserMessage = [...candidateMessages]
                .reverse()
                .find((m) => m.role === 'user')?.content || '';
              const userText =
                typeof lastUserMessage === 'string'
                  ? lastUserMessage
                  : JSON.stringify(lastUserMessage);
              capturedUserText = userText;
              const autoSkills = matchAndLoadRelevantSkills(userText, 1);
              return chat({
                adapter,
                messages: converted.messages,
                systemPrompts: [
                  prompt,
                  ...(autoSkills ? [autoSkills] : []),
                  ...converted.systemPrompts,
                  ...(ctx.learnedSkills.catalog
                    ? [ctx.learnedSkills.catalog]
                    : []),
                ],
                abortController: ctx.abortController,
                threadId: ctx.input.threadId,
                runId: ctx.input.runId,
                modelOptions: { max_completion_tokens: maxTokens },
                agentLoopStrategy: maxIterations(50),
                tools: [
                  ...tanstackTools(serverTools),
                  ...connected,
                  ...converted.tools,
                  ...learnedSkillTools(ctx, check),
                ],
              });
            },
          });

          const accumulator = new ProtocolAccumulator();

          subscription = this.inner
            .run({
              ...input,
              tools: [
                ...(clientTools.some(
                  (tool) => tool.name === pageReviewTool.name,
                )
                  ? [pageReviewTool]
                  : []),
                ...(approvals ? [connectionActionTool] : []),
              ],
              forwardedProps: {},
            })
            .subscribe({
              next: (event) => {
                if (controller.signal.aborted)
                  observe({ type: EventType.RUN_ERROR });
                observe(event);

                // Protocol accumulation
                accumulator.processEvent(event);

                // Broadcast event for active run streaming (e.g. browser reconnect or live subscribers)
                if (runRecord) {
                  globalRunCoordinator.broadcastEvent(runRecord.id, event);
                }

                // Tool execution tracking
                if (runRecord) {
                  if (event.type === EventType.TOOL_CALL_START) {
                    const toolCallId = (event as any).toolCallId || randomUUID();
                    const toolName =
                      (event as any).toolCallName || (event as any).name || 'tool';
                    const isApproval =
                      [pageReviewTool.name, connectionActionTool.name].includes(toolName) ||
                      clientTools.some((t) => t.name === toolName);
                    this.workspace.createToolExecution({
                      runId: runRecord.id,
                      threadId: input.threadId,
                      toolCallId,
                      toolName,
                      args: {},
                      approvalRequired: isApproval,
                      status: isApproval ? 'awaiting_approval' : 'pending',
                    });
                  } else if (event.type === EventType.TOOL_CALL_END) {
                    const toolCallId = (event as any).toolCallId;
                    if (toolCallId) {
                      const tc = accumulator.getToolCalls().find((t) => t.toolCallId === toolCallId);
                      let parsedArgs: Record<string, unknown> = {};
                      if (tc?.argsString) {
                        try {
                          parsedArgs = JSON.parse(tc.argsString);
                        } catch {
                          parsedArgs = { raw: tc.argsString };
                        }
                      }
                      this.workspace.updateToolExecutionByCallId(toolCallId, {
                        args: parsedArgs,
                      });

                      // Persist parent assistant message with tool calls
                      const allMsgs = accumulator.getMessages();
                      const parent = allMsgs.find(
                        (m) => m.role === 'assistant' && m.toolCalls?.some((c) => c.id === toolCallId),
                      );
                      if (parent) {
                        try {
                          this.workspace.saveMessage(
                            input.threadId,
                            'assistant',
                            parent.content ?? '',
                            {
                              id: parent.id,
                              runId: runRecord.id,
                              toolCalls: parent.toolCalls,
                            },
                          );
                        } catch {}
                      }
                    }
                  } else if (event.type === EventType.TOOL_CALL_RESULT) {
                    const toolCallId = (event as any).toolCallId;
                    if (toolCallId) {
                      let parsedResult: any = (event as any).content;
                      if (typeof (event as any).content === 'string') {
                        try {
                          parsedResult = JSON.parse((event as any).content);
                        } catch {
                          parsedResult = (event as any).content;
                        }
                      }
                      const isDeclined =
                        parsedResult && typeof parsedResult === 'object'
                          ? parsedResult.approved === false ||
                            parsedResult.declined === true ||
                            parsedResult.rejected === true
                          : false;

                      this.workspace.resolveToolExecution(input.threadId, toolCallId, {
                        status: !isDeclined ? 'completed' : 'rejected',
                        result: parsedResult,
                        approved: !isDeclined,
                        finishedAt: Date.now(),
                      });
                    }
                    const contentStr =
                      typeof (event as any).content === 'string'
                        ? (event as any).content
                        : JSON.stringify((event as any).content ?? '');
                    try {
                      this.workspace.saveMessage(input.threadId, 'tool', contentStr, {
                        id: (event as any).messageId || randomUUID(),
                        toolCallId: (event as any).toolCallId,
                        runId: runRecord?.id,
                      });
                    } catch {}
                  }
                }

                // Save assistant message on TEXT_MESSAGE_END boundary
                if (event.type === EventType.TEXT_MESSAGE_END) {
                  const messageId = (event as any).messageId;
                  const allMsgs = accumulator.getMessages();
                  const target = allMsgs.find((m) => m.id === messageId);
                  if (target) {
                    try {
                      this.workspace.saveMessage(
                        input.threadId,
                        'assistant',
                        target.content ?? '',
                        {
                          id: target.id,
                          runId: runRecord?.id,
                          toolCalls: target.toolCalls,
                        },
                      );
                    } catch {}
                  }
                }

                if (
                  event.type === EventType.RUN_ERROR ||
                  event.type === EventType.RUN_FINISHED
                ) {
                  finished = true;
                  clearTimeout(timeout);
                  if (event.type === EventType.RUN_FINISHED) {
                    // Check for approval interrupts
                    const outcome = (event as any).outcome;
                    if (
                      outcome?.type === 'interrupt' &&
                      Array.isArray(outcome.interrupts)
                    ) {
                      for (const intr of outcome.interrupts) {
                        const existing = intr.toolCallId
                          ? this.workspace.getToolExecutionByCallId(intr.toolCallId)
                          : null;
                        if (existing) {
                          this.workspace.updateToolExecution(existing.id, {
                            status: 'awaiting_approval',
                            approvalRequired: true,
                            args: intr.args || existing.args,
                          });
                        } else {
                          this.workspace.createToolExecution({
                            id: intr.id || randomUUID(),
                            runId: runRecord.id,
                            threadId: input.threadId,
                            toolCallId: intr.toolCallId,
                            toolName: intr.name,
                            args: intr.args || {},
                            approvalRequired: true,
                            status: 'awaiting_approval',
                          });
                        }
                      }
                    }

                    // Also check for pending client approval tools that returned without an interrupt outcome
                    const runExecutions = this.workspace.getToolExecutions(input.threadId);
                    for (const exec of runExecutions) {
                      if (
                        exec.runId === runRecord?.id &&
                        exec.status !== 'completed' &&
                        exec.status !== 'failed'
                      ) {
                        const isApproval =
                          exec.approvalRequired ||
                          [pageReviewTool.name, connectionActionTool.name].includes(exec.toolName) ||
                          clientTools.some((t) => t.name === exec.toolName);
                        if (isApproval) {
                          let finalArgs = exec.args;
                          if (!finalArgs || Object.keys(finalArgs).length === 0) {
                            const tc = accumulator
                              .getToolCalls()
                              .find((t) => t.toolCallId === exec.toolCallId);
                            if (tc?.argsString) {
                              try {
                                finalArgs = JSON.parse(tc.argsString);
                              } catch {
                                finalArgs = { raw: tc.argsString };
                              }
                            }
                          }
                          this.workspace.updateToolExecution(exec.id, {
                            status: 'awaiting_approval',
                            approvalRequired: true,
                            args: finalArgs,
                          });
                        }
                      }
                    }

                    // Save all canonical messages from accumulator to SQLite
                    const completedMessages = accumulator.getMessages();
                    for (const m of completedMessages) {
                      try {
                        if (m.role === 'assistant') {
                          this.workspace.saveMessage(
                            input.threadId,
                            'assistant',
                            m.content ?? '',
                            {
                              id: m.id,
                              runId: runRecord?.id,
                              toolCalls: m.toolCalls,
                            },
                          );
                        } else if (m.role === 'tool') {
                          this.workspace.saveMessage(
                            input.threadId,
                            'tool',
                            m.content ?? '',
                            {
                              id: m.id,
                              runId: runRecord?.id,
                              toolCallId: m.toolCallId,
                            },
                          );
                        }
                      } catch {}
                    }

                    if (runRecord) {
                      try {
                        this.workspace.updateRun(runRecord.id, {
                          status: 'completed',
                          finishedAt: Date.now(),
                        });
                      } catch {}
                      globalRunCoordinator.completeRun(runRecord.id);
                    }
                  } else if (event.type === EventType.RUN_ERROR && runRecord) {
                    try {
                      this.workspace.updateRun(runRecord.id, {
                        status: controller.signal.aborted
                          ? 'cancelled'
                          : 'failed',
                        error: (event as any).message || 'Agent error',
                        finishedAt: Date.now(),
                      });
                    } catch {}
                    globalRunCoordinator.completeRun(runRecord.id);
                  }
                }
                subscriber.next(
                  this.channel && event.type === EventType.RUN_ERROR
                    ? channelError()
                    : event,
                );
              },
              error: (error: unknown) => {
                clearTimeout(timeout);
                if (runRecord) {
                  try {
                    this.workspace.updateRun(runRecord.id, {
                      status: controller.signal.aborted
                        ? 'cancelled'
                        : 'failed',
                      error:
                        error instanceof Error
                          ? error.message
                          : String(error),
                      finishedAt: Date.now(),
                    });
                  } catch {}
                  globalRunCoordinator.completeRun(runRecord.id);
                }
                observe({ type: EventType.RUN_ERROR });
                if (this.channel) {
                  subscriber.next(channelError());
                  subscriber.complete();
                } else subscriber.error(error);
              },
              complete: () => {
                clearTimeout(timeout);
                if (controller.signal.aborted && !finished) {
                  if (runRecord) {
                    try {
                      this.workspace.updateRun(runRecord.id, {
                        status: 'cancelled',
                        finishedAt: Date.now(),
                      });
                    } catch {}
                    globalRunCoordinator.completeRun(runRecord.id);
                  }
                  observe({ type: EventType.RUN_ERROR });
                }
                subscriber.complete();
              },
            });
        };
        void start().catch(fail);
      } catch (error) {
        fail(error);
      }
      return () => {
        clearTimeout(timeout);
        clearInterval(watcher);
        controller.abort();
        if (runRecord && !finished) {
          try {
            this.workspace.updateRun(runRecord.id, {
              status: 'cancelled',
              finishedAt: Date.now(),
            });
          } catch {}
          globalRunCoordinator.completeRun(runRecord.id);
        }
        this.inner?.abortRun();
        subscription?.unsubscribe();
      };
    });
  }
}
