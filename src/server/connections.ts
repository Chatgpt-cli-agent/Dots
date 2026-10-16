import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import { z } from 'zod';
import type {
  Connection,
  ConnectionActionResult,
  ConnectionTool,
} from '../shared/connection-types.js';
import type { ConnectionStore } from './connection-store.js';
import type { PluginStore } from './plugin-store.js';
const MAX_TOOLS = 100;
const MAX_SCHEMA_BYTES = 16_000;
const MAX_RESULT_CHARS = 20_000;
export const connectionInput = z
  .object({
    name: z.string().trim().min(1).max(40),
    url: z
      .string()
      .trim()
      .url()
      .max(2048)
      .refine((value) => {
        const url = new URL(value);
        return (
          ['http:', 'https:'].includes(url.protocol) &&
          !url.username &&
          !url.password
        );
      }, 'Use an http(s) MCP endpoint without embedded credentials.'),
    token: z.string().trim().max(4096).optional(),
  })
  .strict();
export type ConnectionInput = z.infer<typeof connectionInput>;
export type McpTransportFactory = (target: {
  url: string;
  token?: string;
  signal: AbortSignal;
}) => Transport;
export const httpTransport: McpTransportFactory = ({ url, token, signal }) =>
  new StreamableHTTPClientTransport(new URL(url), {
    requestInit: token
      ? { headers: { Authorization: `Bearer ${token}` } }
      : undefined,
    fetch: (input, init) =>
      fetch(input, {
        ...init,
        signal: AbortSignal.any([
          signal,
          ...(init?.signal ? [init.signal] : []),
        ]),
      }),
  });
const listedTool = z.object({
  name: z.string().min(1).max(128),
  title: z.string().optional(),
  description: z.string().optional(),
  inputSchema: z.record(z.string(), z.unknown()),
  annotations: z
    .object({
      title: z.string().optional(),
      readOnlyHint: z.boolean().optional(),
    })
    .passthrough()
    .optional(),
});
// Model-facing names must match ^[a-zA-Z0-9_-]{1,64}$ and stay unique across
// every connection a Dot has, so they are derived here, deterministically.
const slug = (value: string, max: number) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, max) || 'tool';
export interface ExposedTool {
  name: string;
  connection: Connection;
  tool: ConnectionTool;
}
// Names are assigned over every tool, enabled or not, so turning one tool
// off never moves its name to another. Approvals do not rely on names: they
// bind to a stored connection, tool, and arguments.
export function exposedTools(connections: Connection[]): ExposedTool[] {
  const used = new Set<string>();
  return connections
    .flatMap((connection) =>
      connection.tools.map((tool) => {
        let base: string;
        if (connection.id.startsWith('plugin:')) {
          const parts = connection.name.split(':');
          const pName = parts[0] ?? 'p';
          const sName = parts[1] ?? 's';
          const fullBase = `plugin__${slug(pName, 16)}__${slug(sName, 16)}__${slug(tool.name, 28)}`;
          base = fullBase.length > 64 ? fullBase.slice(0, 64) : fullBase;
        } else {
          base = `${slug(connection.name, 20)}__${slug(tool.name, 40)}`;
        }
        let name = base;
        for (let n = 2; used.has(name); n++) name = `${base.slice(0, 60)}_${n}`;
        used.add(name);
        return { name, connection, tool };
      }),
    )
    .filter(({ tool }) => tool.enabled);
}
export function scrubCredentials(
  text: string,
  secrets: (string | undefined | null)[],
): string {
  if (!text) return text;
  let out = text;
  for (const secret of secrets) {
    if (!secret || typeof secret !== 'string') continue;
    const cleanSecret = secret.trim();
    if (cleanSecret.length < 3) continue;
    out = out.split(cleanSecret).join('[REDACTED]');
    try {
      const encoded = encodeURIComponent(cleanSecret);
      if (encoded !== cleanSecret) {
        out = out.split(encoded).join('[REDACTED]');
      }
    } catch {}
  }
  return out;
}

export function normalizeResult(
  result: unknown,
  secret?: string,
): ConnectionActionResult {
  const envelope = z
    .object({
      isError: z.boolean().optional(),
      structuredContent: z.unknown().optional(),
      content: z
        .array(
          z
            .object({ type: z.string(), text: z.string().optional() })
            .passthrough(),
        )
        .optional(),
    })
    .passthrough()
    .safeParse(result);
  if (!envelope.success)
    return {
      isError: true,
      text: 'The service returned an unreadable result.',
    };
  const parts = (envelope.data.content ?? []).map((item) =>
    item.type === 'text' ? (item.text ?? '') : `[${item.type} omitted]`,
  );
  if (!parts.some((part) => part.trim()) && envelope.data.structuredContent)
    parts.push(JSON.stringify(envelope.data.structuredContent));
  let text = parts.join('\n').trim() || '(no content)';
  if (secret) {
    text = scrubCredentials(text, [secret]);
  }
  return {
    isError: !!envelope.data.isError,
    text:
      text.length > MAX_RESULT_CHARS
        ? `${text.slice(0, MAX_RESULT_CHARS)}\n[truncated]`
        : text,
  };
}

const failure = (error: unknown, secret?: string) => {
  let message: string;
  if (!(error instanceof Error))
    message = 'Could not reach the connected service.';
  else if (error.name === 'AbortError' || error.name === 'TimeoutError')
    message = 'The connected service did not respond in time.';
  else {
    const status = (error as { code?: unknown }).code;
    // OAuth-only servers surface UnauthorizedError when no token is supplied.
    if (
      status === 401 ||
      status === 403 ||
      error.name === 'UnauthorizedError' ||
      error.constructor.name === 'UnauthorizedError'
    )
      message = 'The connected service rejected the credentials. Check the bearer token.';
    else
      message = `Could not reach the connected service${error.message ? `: ${error.message.slice(0, 200)}` : '.'}`;
  }
  return secret ? scrubCredentials(message, [secret]) : message;
};
export class ConnectionService {
  constructor(
    readonly store: ConnectionStore,
    private transport: McpTransportFactory = httpTransport,
    private timeoutMs = 60_000,
    private pluginStore?: PluginStore,
  ) {}

  setPluginStore(pluginStore: PluginStore) {
    this.pluginStore = pluginStore;
  }
  private async session<T>(
    target: { url: string; token?: string },
    signal: AbortSignal | undefined,
    use: (client: Client, signal: AbortSignal) => Promise<T>,
  ) {
    const bounded = AbortSignal.any([
      AbortSignal.timeout(this.timeoutMs),
      ...(signal ? [signal] : []),
    ]);
    const client = new Client({ name: 'opendots', version: '0.1.0' });
    try {
      await client.connect(this.transport({ ...target, signal: bounded }), {
        signal: bounded,
      });
      return await use(client, bounded);
    } finally {
      await client.close().catch(() => {});
    }
  }
  private async discover(
    target: { url: string; token?: string },
    previous: ConnectionTool[] = [],
  ) {
    return this.session(target, undefined, async (client, signal) => {
      const tools: ConnectionTool[] = [];
      let cursor: string | undefined;
      do {
        const page = await client.listTools(cursor ? { cursor } : {}, {
          signal,
        });
        for (const raw of page.tools) {
          const parsed = listedTool.safeParse(raw);
          if (!parsed.success || tools.length >= MAX_TOOLS) continue;
          const tool = parsed.data;
          const rawSchema = JSON.stringify(tool.inputSchema);
          const safeSchema = target.token
            ? scrubCredentials(rawSchema, [target.token])
            : rawSchema;
          if (safeSchema.length > MAX_SCHEMA_BYTES) continue;
          const readOnly = tool.annotations?.readOnlyHint === true;
          const prior = previous.find((item) => item.name === tool.name);
          const rawTitle = tool.title ?? tool.annotations?.title ?? tool.name;
          const rawDesc = (tool.description ?? '').slice(0, 1000);
          tools.push({
            name: tool.name,
            title: target.token
              ? scrubCredentials(rawTitle, [target.token])
              : rawTitle,
            description: target.token
              ? scrubCredentials(rawDesc, [target.token])
              : rawDesc,
            inputSchema: { type: 'object', ...JSON.parse(safeSchema) },
            readOnly,
            // New tools start enabled; anything not read-only needs approval.
            enabled: prior?.enabled ?? true,
            requiresApproval: prior?.requiresApproval ?? !readOnly,
          });
        }
        cursor = page.nextCursor;
      } while (cursor && tools.length < MAX_TOOLS);
      return tools;
    });
  }
  async add(dotId: string, input: ConnectionInput) {
    const value = connectionInput.parse(input);
    let tools: ConnectionTool[];
    try {
      tools = await this.discover({ url: value.url, token: value.token });
    } catch (error) {
      throw new Error(failure(error, value.token), { cause: error });
    }
    return this.store.create(dotId, value, tools);
  }
  async refresh(id: string) {
    const connection = this.store.get(id);
    if (!connection) throw new Error('Connection not found.');
    const creds = this.store.credentials(id);
    try {
      const discovered = await this.discover(creds);
      // Owner changes made while discovery ran win: merge against the
      // settings as they are now, not as they were when it started.
      const current = this.store.get(id);
      if (!current) throw new Error('Connection not found.');
      return this.store.saveTools(
        id,
        discovered.map((tool) => {
          const owner = current.tools.find((item) => item.name === tool.name);
          return owner
            ? {
                ...tool,
                enabled: owner.enabled,
                requiresApproval: owner.requiresApproval,
              }
            : tool;
        }),
      );
    } catch (error) {
      return this.store.setError(id, failure(error, creds.token));
    }
  }
  setTool(
    id: string,
    name: string,
    patch: { enabled?: boolean; requiresApproval?: boolean },
  ) {
    const connection = this.store.get(id);
    if (!connection) throw new Error('Connection not found.');
    if (!connection.tools.some((tool) => tool.name === name))
      throw new Error('Connection tool not found.');
    return this.store.saveTools(
      id,
      connection.tools.map((tool) =>
        tool.name === name ? { ...tool, ...patch } : tool,
      ),
      connection.error,
    );
  }
  private pluginConnections(dotId: string): Connection[] {
    if (!this.pluginStore) return [];
    return this.pluginStore
      .list()
      .filter((p) => p.enabled && p.dotIds.includes(dotId))
      .flatMap((p) =>
        p.services
          .filter((s) => s.enabled)
          .map((s) => ({
            id: `plugin:${p.id}:${s.name}`,
            dotId,
            name: `${p.name}:${s.name}`,
            url: s.url,
            hasToken: s.hasToken,
            tools: s.tools,
            error: s.error,
            createdAt: p.installedAt,
            updatedAt: s.updatedAt,
          })),
      );
  }

  tools(dotId: string) {
    return exposedTools([
      ...this.store.list(dotId),
      ...this.pluginConnections(dotId),
    ]);
  }
  resolve(dotId: string, name: string) {
    const match = this.tools(dotId).find((tool) => tool.name === name);
    if (!match)
      throw new Error('Connection tool is not available to this Dot.');
    return match;
  }
  // The tool an approval was created for, by connection and real tool name,
  // if the Dot still has it enabled.
  bound(dotId: string, connectionId: string, toolName: string) {
    const match = this.tools(dotId).find(
      (item) =>
        item.connection.id === connectionId && item.tool.name === toolName,
    );
    if (!match)
      throw new Error(
        'This tool is no longer enabled for this Dot. Nothing was run.',
      );
    return match;
  }
  async call(
    exposed: ExposedTool,
    args: Record<string, unknown>,
    signal?: AbortSignal,
  ): Promise<ConnectionActionResult> {
    let credentials: { url: string; token?: string } | undefined;
    try {
      if (exposed.connection.id.startsWith('plugin:')) {
        const parts = exposed.connection.id.split(':');
        const pluginId = parts[1];
        const serviceName = parts.slice(2).join(':');
        const creds = this.pluginStore?.getServiceCredentials(pluginId, serviceName);
        if (!creds) throw new Error('Plugin service credentials not found.');
        const service = this.pluginStore?.getService(pluginId, serviceName);
        if (service?.requiresToken && !creds.token) {
          return {
            isError: true,
            text: 'The connected service rejected the credentials. Check the bearer token.',
          };
        }
        credentials = creds;
      } else {
        credentials = this.store.credentials(exposed.connection.id);
      }
      return await this.session(
        credentials,
        signal,
        async (client, bounded) =>
          normalizeResult(
            await client.callTool(
              { name: exposed.tool.name, arguments: args },
              undefined,
              { signal: bounded },
            ),
            credentials!.token,
          ),
      );
    } catch (error) {
      return { isError: true, text: failure(error, credentials?.token) };
    }
  }

  async discoverTools(
    target: { url: string; token?: string },
    previous: ConnectionTool[] = [],
  ): Promise<ConnectionTool[]> {
    return this.discover(target, previous);
  }

  async refreshPluginService(pluginId: string, serviceName: string) {
    if (!this.pluginStore) throw new Error('Plugin store not configured.');
    const service = this.pluginStore.getService(pluginId, serviceName);
    if (!service) throw new Error('Plugin service not found.');
    let credentials: { url: string; token?: string } | undefined;
    try {
      credentials = this.pluginStore.getServiceCredentials(
        pluginId,
        serviceName,
      );
      if (!credentials) throw new Error('Plugin service credentials not found.');
      if (service.requiresToken && !credentials.token) {
        return this.pluginStore.setServiceTools(
          pluginId,
          serviceName,
          service.tools,
          'The connected service rejected the credentials. Check the bearer token.',
        );
      }
      const discovered = await this.discover(credentials, service.tools);
      return this.pluginStore.setServiceTools(
        pluginId,
        serviceName,
        discovered,
        null,
      );
    } catch (error) {
      return this.pluginStore.setServiceTools(
        pluginId,
        serviceName,
        service.tools,
        failure(error, credentials?.token),
      );
    }
  }
}
