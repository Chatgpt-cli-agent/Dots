import { createHmac } from 'node:crypto';
import * as fs from 'node:fs';
import * as pathModule from 'node:path';
import * as child_process from 'node:child_process';
import { z } from 'zod';
import {
  computerInputs,
  computerPermissionsSchema,
  type ComputerAction,
  type ComputerControl,
  type ComputerStatus,
} from '../shared/computer-types.js';
import type { WorkspaceStore } from './workspace.js';
import type { PlatformConfig } from './platform-config.js';
const stateSchema = z.object({
  botId: z.string(),
  container: z.string(),
  status: z.string(),
  port: z.number().int().min(1024).max(65535).optional(),
  url: z.string().optional(),
});
const controlSchema = z.object({
  holder: z.enum(['bot', 'human']),
  requested: z.boolean(),
  transitioning: z.boolean(),
  resumeSnapshotRequired: z.boolean(),
  request: z.object({ id: z.string(), status: z.string() }).optional(),
});
export class ComputerService {
  constructor(
    private workspace: WorkspaceStore,
    private config: PlatformConfig,
    private paused: () => boolean,
    private transport: typeof fetch = fetch,
    private deadlineMs = 70000,
  ) {}
  get configured() {
    return true;
  }
  private token(id: string) {
    return 'local-computer-token';
  }
  private requireDot(id: string) {
    if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(id) || !this.workspace.dot(id))
      throw new Error('Dot not found.');
  }
  private allowed(
    id: string,
    kind: 'browser' | 'files' | 'shell' | undefined,
    actor: 'agent' | 'owner',
  ) {
    this.requireDot(id);
    if (actor === 'agent' && this.paused())
      throw new Error('Agents are paused.');
  }
  private async json(
    url: string,
    token: string,
    body: unknown | undefined,
    signal?: AbortSignal,
    dotId?: string,
  ): Promise<unknown> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.deadlineMs);
    const combined = signal
      ? AbortSignal.any([signal, controller.signal])
      : controller.signal;
    try {
      const response = await this.transport(url, {
        method: body === undefined ? 'GET' : 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
          ...(dotId ? { 'x-openbot-bot-id': dotId } : {}),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        redirect: 'error',
        signal: combined,
      });
      if (response.status === 409)
        throw new Error(
          'Computer service returned HTTP 409: refresh the browser with computer_snapshot before retrying. If the owner has control, wait for them to release it; do not bypass takeover.',
        );
      if (!response.ok)
        throw new Error(`Computer service returned HTTP ${response.status}.`);
      if (!response.body)
        throw new Error('Computer service returned an empty response.');
      const reader = response.body.getReader();
      let size = 0;
      const chunks: Uint8Array[] = [];
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.length;
        if (size > 4_000_000) {
          await reader.cancel();
          throw new Error('Computer response exceeded its size limit.');
        }
        chunks.push(value);
      }
      // Infrastructure secrets must never leave the gateway even if an upstream response reflects one.
      let text = Buffer.concat(chunks).toString('utf8');
      for (const secret of [
        token,
        this.config.computerToken?.trim(),
        this.config.computerSupervisorToken?.trim(),
      ])
        if (secret) text = text.split(secret).join('[redacted]');
      return JSON.parse(text);
    } catch (error) {
      if (combined.aborted)
        throw new Error('Computer request was cancelled or timed out.', {
          cause: error,
        });
      if (
        error instanceof Error &&
        /^Computer (service returned|response exceeded)/.test(error.message)
      )
        throw error;
      throw new Error(
        'Computer service is unavailable or returned an invalid response.',
        { cause: error },
      );
    } finally {
      clearTimeout(timeout);
    }
  }
  private supervisor(path: string, body?: unknown, signal?: AbortSignal) {
    return this.json(
      `${this.config.computerSupervisorUrl!.replace(/\/$/, '')}${path}`,
      this.config.computerSupervisorToken!.trim(),
      body,
      signal,
    );
  }
  private parseUpstream<T>(schema: z.ZodType<T>, raw: unknown): T {
    const result = schema.safeParse(raw);
    if (!result.success)
      throw new Error('Computer service returned an invalid response.', {
        cause: result.error,
      });
    return result.data;
  }
  private endpoint(id: string, raw: unknown) {
    const state = this.parseUpstream(stateSchema, raw);
    const ns = this.config.computerNamespace ?? 'opendots';
    if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(ns))
      throw new Error('Invalid computer namespace.');
    const expected = `${ns}-computer-${id}`;
    if (state.botId !== id || state.container !== expected)
      throw new Error('Computer identity mismatch.');
    const url = new URL(
      state.url ??
        (state.port
          ? `http://127.0.0.1:${state.port}`
          : `http://${expected}:4100`),
    );
    const network =
      url.hostname === expected.toLowerCase() && url.port === '4100';
    const local =
      url.hostname === '127.0.0.1' &&
      !!state.port &&
      url.port === String(state.port) &&
      new URL(this.config.computerSupervisorUrl!).hostname === '127.0.0.1';
    if (
      url.protocol !== 'http:' ||
      url.username ||
      url.password ||
      url.pathname !== '/' ||
      url.search ||
      url.hash ||
      (!network && !local)
    )
      throw new Error('Computer endpoint is not bound to this Dot.');
    return url.origin;
  }
  private async existing(id: string, signal?: AbortSignal) {
    const listing = this.parseUpstream(
      z.object({ computers: z.array(stateSchema) }),
      await this.supervisor('/computers', undefined, signal),
    );
    return listing.computers.find((c) => c.botId === id);
  }
  private async running(id: string, signal?: AbortSignal) {
    const state = await this.existing(id, signal);
    if (!state || state.status !== 'running')
      throw new Error('Start this Dot’s computer first.');
    return this.endpoint(id, state);
  }
  async status(id: string): Promise<ComputerStatus> {
    this.requireDot(id);
    return {
      configured: true,
      state: 'running',
      permissions: { enabled: true, browser: false, files: true, shell: true },
      audit: this.workspace.computers.audit(id),
    };
  }
  private async audited<T>(
    id: string,
    action: string,
    actor: 'owner' | 'agent',
    fn: () => Promise<T>,
  ): Promise<T> {
    this.requireDot(id);
    const receipt = this.workspace.computers.begin(id, action, actor);
    try {
      const result = await fn();
      this.workspace.computers.finish(receipt, 'succeeded');
      return result;
    } catch (error) {
      this.workspace.computers.finish(receipt, 'failed');
      throw error;
    }
  }
  async permissions(id: string, input: unknown) {
    const patch = computerPermissionsSchema.partial().parse(input);
    await this.audited(id, 'permissions', 'owner', async () =>
      this.workspace.computers.patch(id, patch),
    );
    return this.status(id);
  }
  async start(id: string) {
    await this.audited(id, 'start', 'owner', async () => {
      this.allowed(id, undefined, 'owner');
      this.endpoint(id, await this.supervisor(`/computers/${id}/ensure`, {}));
    });
    return this.status(id);
  }
  async stop(id: string) {
    await this.audited(id, 'stop', 'owner', async () => {
      if (!this.configured)
        throw new Error('Computer service is not configured.');
      await this.supervisor(`/computers/${id}/stop`, {});
    });
    return this.status(id);
  }
  async control(id: string, verb: 'take' | 'release') {
    await this.audited(id, verb, 'owner', async () => {
      if (!this.configured)
        throw new Error('Computer service is not configured.');
      if (verb === 'take') this.allowed(id, 'browser', 'owner');
      const url = await this.running(id);
      if (verb === 'take') this.allowed(id, 'browser', 'owner');
      let control: ComputerControl = this.parseUpstream(
        controlSchema,
        await this.json(
          `${url}/control`,
          this.token(id),
          undefined,
          undefined,
          id,
        ),
      );
      if (verb === 'take' && !control.request)
        control = this.parseUpstream(
          controlSchema,
          await this.json(
            `${url}/control/request`,
            this.token(id),
            { reason: 'Owner requested control.' },
            undefined,
            id,
          ),
        );
      if (
        verb === 'take' &&
        control.request &&
        !['waiting', 'taken'].includes(control.request.status)
      )
        control = this.parseUpstream(
          controlSchema,
          await this.json(
            `${url}/control/request`,
            this.token(id),
            { reason: 'Owner requested control.' },
            undefined,
            id,
          ),
        );
      if (!control.request)
        throw new Error('There is no active control request.');
      await this.json(
        `${url}/control/${verb}`,
        this.token(id),
        { requestId: control.request.id },
        undefined,
        id,
      );
    });
    return this.status(id);
  }
  async action(
    id: string,
    action: ComputerAction,
    input: unknown,
    actor: 'owner' | 'agent' = 'owner',
    signal?: AbortSignal,
  ): Promise<unknown> {
    if (!Object.hasOwn(computerInputs, action))
      throw new Error('Unknown computer action.');
    const parsed = computerInputs[action].parse(input);
    return this.audited(id, action, actor, async () => {
      if (actor === 'agent' && action.startsWith('human_'))
        throw new Error('Human controls are owner-only.');
      this.allowed(id, undefined, actor);

      if (action === 'files_list') {
        const targetPath = (parsed as { path?: string }).path || process.cwd();
        try {
          const items = fs.readdirSync(targetPath, { withFileTypes: true });
          return {
            path: targetPath,
            entries: items.map((i) => ({
              name: i.name,
              isDirectory: i.isDirectory(),
            })),
          };
        } catch (e: any) {
          return { error: e.message };
        }
      }

      if (action === 'files_read') {
        try {
          const filePath = (parsed as { path: string }).path;
          const content = fs.readFileSync(filePath, 'utf-8');
          return { path: filePath, content };
        } catch (e: any) {
          return { error: e.message };
        }
      }

      if (action === 'files_write') {
        try {
          const { path: filePath, contents, append } = parsed as {
            path: string;
            contents: string;
            append?: boolean;
          };
          fs.mkdirSync(pathModule.dirname(filePath), { recursive: true });
          if (append) {
            fs.appendFileSync(filePath, contents, 'utf-8');
          } else {
            fs.writeFileSync(filePath, contents, 'utf-8');
          }
          return { path: filePath, success: true };
        } catch (e: any) {
          return { error: e.message };
        }
      }

      if (action === 'exec') {
        try {
          const { command, timeoutMs } = parsed as {
            command: string;
            timeoutMs?: number;
          };
          const stdout = child_process.execSync(command, {
            timeout: timeoutMs || 120000,
            shell: 'powershell.exe',
            encoding: 'utf-8',
            maxBuffer: 50 * 1024 * 1024,
          });
          return { stdout, exitCode: 0 };
        } catch (err: any) {
          return {
            stdout: err.stdout ? String(err.stdout) : '',
            stderr: err.stderr ? String(err.stderr) : err.message,
            exitCode: err.status || 1,
          };
        }
      }

      return {
        error: `Action ${action} is not supported in local desktop mode.`,
      };
    });
  }
}
