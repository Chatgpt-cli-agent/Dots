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
import { Observable } from 'rxjs';
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
        if (!this.config.apiKey || !this.config.model) {
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
        let dotBaseUrl = this.config.baseUrl ?? 'http://127.0.0.1:11434/v1';
        let dotModel = this.config.model ?? 'qwen2.5-coder:14b';
        const dName = (dot.name || '').toLowerCase();
        if (dName.includes('research')) {
          dotBaseUrl = 'http://127.0.0.1:11435/v1';
          dotModel = 'research';
        } else if (dName.includes('little')) {
          dotBaseUrl = 'http://127.0.0.1:8080/v1';
          dotModel = 'qwen2.5-coder:7b';
        } else if (dName.includes('coding')) {
          dotBaseUrl = 'http://127.0.0.1:11434/v1';
          dotModel = 'coding';
        }
        const maxTokens = dName.includes('research') ? 2048 : 4096;
        const adapter = openaiCompatibleText(dotModel, {
          apiKey: this.config.apiKey || 'ollama',
          baseURL: dotBaseUrl,
          api: 'chat-completions',
          maxRetries: 1,
        });
        const start = async () => {
          let capturedUserText = '';
          let assistantResponse = '';
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
          const serverTools = [
            ...tools,
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
4. Deliver concrete, thorough technical answers, code, and evidence.

${computer.configured ? 'Computer tools (computer_exec, computer_files_read, computer_files_write, computer_files_list) have unrestricted access across ALL mounted Windows drives (C:, D:, H:, I:, J:, etc.). Use absolute paths (e.g. "C:\\...", "J:\\...", "D:\\...") or PowerShell commands to work across any drive.' : ''}
Use search_web for web research, list_skills and read_skill for GalaxyOne engineering protocols. Preferences: ${JSON.stringify(memories)}. Default page destination: ${dot.spaceId}. Current time: ${new Date().toISOString()} (UTC).`;
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
              const converted = convertInputToTanStackAI({
                ...ctx.input,
                messages: ctx.input.messages.filter(
                  (message) =>
                    message.role !== 'system' && message.role !== 'developer',
                ),
              });
              const lastUserMessage = [...ctx.input.messages]
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
                if (
                  (event.type === EventType.TEXT_MESSAGE_CONTENT ||
                    event.type === EventType.TEXT_MESSAGE_CHUNK) &&
                  typeof (event as any).content === 'string'
                ) {
                  assistantResponse += (event as any).content;
                }
                if (
                  event.type === EventType.RUN_ERROR ||
                  event.type === EventType.RUN_FINISHED
                ) {
                  finished = true;
                  clearTimeout(timeout);
                  if (event.type === EventType.RUN_FINISHED && assistantResponse) {
                    try {
                      if (capturedUserText) {
                        this.workspace.saveMessage(input.threadId, 'user', capturedUserText);
                      }
                      this.workspace.saveMessage(input.threadId, 'assistant', assistantResponse);
                    } catch {}
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
                observe({ type: EventType.RUN_ERROR });
                if (this.channel) {
                  subscriber.next(channelError());
                  subscriber.complete();
                } else subscriber.error(error);
              },
              complete: () => {
                clearTimeout(timeout);
                if (controller.signal.aborted && !finished)
                  observe({ type: EventType.RUN_ERROR });
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
        this.inner?.abortRun();
        subscription?.unsubscribe();
      };
    });
  }
}
