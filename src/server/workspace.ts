import { ComputerStore } from './computer-store.js';
import { ConnectionStore } from './connection-store.js';
import { Pages } from './pages.js';
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';
import { validateLearningSettings } from '../shared/learning.js';
import { globalRunCoordinator } from './run-coordinator.js';
import { PluginStore } from './plugin-store.js';
import type {
  CallReceipt,
  Conversation,
  Dot,
  NativeMessage,
  NativeRun,
  NativeToolExecution,
  Space,
} from '../shared/types.js';
export type { NativeMessage, NativeRun, NativeToolExecution };

export interface AGUIToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}

export function toAGUIToolCalls(calls: unknown): AGUIToolCall[] {
  if (!Array.isArray(calls)) return [];
  return calls.map((tc: any) => {
    const id = String(tc.id || randomUUID());
    let name = '';
    let argsStr = '{}';
    if (tc.type === 'function' && tc.function) {
      name = String(tc.function.name || '');
      argsStr =
        typeof tc.function.arguments === 'string'
          ? tc.function.arguments
          : JSON.stringify(tc.function.arguments ?? {});
    } else {
      name = String(tc.name || tc.toolName || tc.function?.name || '');
      const rawArgs = tc.args ?? tc.arguments ?? tc.function?.arguments ?? {};
      argsStr = typeof rawArgs === 'string' ? rawArgs : JSON.stringify(rawArgs);
    }
    return {
      id,
      type: 'function' as const,
      function: {
        name,
        arguments: argsStr,
      },
    };
  });
}

export function formatMessageForAGUI(m: {
  id: string;
  role: string;
  content: unknown;
  toolCalls?: unknown;
  toolCallId?: string | null;
  createdAt?: number;
}) {
  const role = m.role;
  const contentStr =
    typeof m.content === 'string' ? m.content : JSON.stringify(m.content ?? '');

  if (role === 'assistant') {
    const toolCalls = toAGUIToolCalls(m.toolCalls);
    return {
      id: m.id,
      role: 'assistant' as const,
      content: contentStr,
      ...(toolCalls.length > 0 ? { toolCalls } : {}),
    };
  }

  if (role === 'tool') {
    return {
      id: m.id,
      role: 'tool' as const,
      content: contentStr,
      toolCallId: String(m.toolCallId || m.id),
    };
  }

  if (role === 'developer' || role === 'system') {
    return {
      id: m.id,
      role: role as 'developer' | 'system',
      content: contentStr,
    };
  }

  return {
    id: m.id,
    role: 'user' as const,
    content: contentStr,
  };
}
export class WorkspaceStore {
  private db: DatabaseSync;
  readonly plugins: PluginStore;
  readonly pluginDirectory: string;
  readonly pages: Pages;
  readonly computers: ComputerStore;
  readonly connections: ConnectionStore;
  constructor(
    path: string,
    readonly ownerId: string,
  ) {
    if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
    this.db = new DatabaseSync(path);
    this.pluginDirectory = `${dirname(path)}/plugins`;
    this.plugins = new PluginStore(this.db);
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS spaces(id TEXT PRIMARY KEY, name TEXT NOT NULL, description TEXT NOT NULL, createdAt INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS dots(id TEXT PRIMARY KEY, spaceId TEXT NOT NULL, name TEXT NOT NULL, instructions TEXT NOT NULL, researchAllowed INTEGER NOT NULL, memoryAllowed INTEGER NOT NULL, createdAt INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS thread_bindings(id TEXT PRIMARY KEY, dotId TEXT NOT NULL, ownerId TEXT NOT NULL, title TEXT NOT NULL, createdAt INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS task_threads(taskId TEXT PRIMARY KEY, threadId TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS calls(id TEXT PRIMARY KEY, threadId TEXT NOT NULL, startedAt INTEGER NOT NULL, endedAt INTEGER, status TEXT NOT NULL, transcript TEXT NOT NULL, error TEXT);
      CREATE TABLE IF NOT EXISTS captures(threadId TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS thread_messages(id TEXT PRIMARY KEY, threadId TEXT NOT NULL, role TEXT NOT NULL, content TEXT NOT NULL, createdAt INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS runs(id TEXT PRIMARY KEY, threadId TEXT NOT NULL, dotId TEXT NOT NULL, parentRunId TEXT, status TEXT NOT NULL, error TEXT, startedAt INTEGER NOT NULL, finishedAt INTEGER, metadata TEXT);
      CREATE TABLE IF NOT EXISTS tool_executions(id TEXT PRIMARY KEY, runId TEXT NOT NULL, threadId TEXT NOT NULL, toolName TEXT NOT NULL, args TEXT NOT NULL, result TEXT, status TEXT NOT NULL, approvalRequired INTEGER NOT NULL DEFAULT 0, approved INTEGER NOT NULL DEFAULT 0, error TEXT, createdAt INTEGER NOT NULL, finishedAt INTEGER);`);
    for (const [table, column, definition] of [
      ['dots', 'learningContainerId', 'TEXT'],
      ['dots', 'skillDeliveryEnabled', 'INTEGER NOT NULL DEFAULT 0'],
      ['dots', 'appsAllowed', 'INTEGER NOT NULL DEFAULT 0'],
      ['dots', 'composioToolkits', "TEXT NOT NULL DEFAULT '[]'"],
      ['dots', 'composioSessionId', 'TEXT'],
      ['dots', 'composioPolicyHash', 'TEXT'],
      ['dots', 'modelEndpoint', 'TEXT'],
      ['dots', 'modelId', 'TEXT'],
      ['dots', 'contextLimit', 'INTEGER'],
      ['dots', 'maxCompletionTokens', 'INTEGER'],
      ['dots', 'apiKey', 'TEXT'],
      ['tool_executions', 'toolCallId', 'TEXT'],
      ['thread_bindings', 'learningContainerId', 'TEXT'],
      ['thread_bindings', 'updatedAt', 'INTEGER'],
      ['thread_bindings', 'archivedAt', 'INTEGER'],
      ['thread_bindings', 'metadata', 'TEXT'],
      ['thread_messages', 'runId', 'TEXT'],
      ['thread_messages', 'toolCalls', 'TEXT'],
      ['thread_messages', 'toolCallId', 'TEXT'],
      ['thread_messages', 'status', 'TEXT'],
      ['thread_messages', 'metadata', 'TEXT'],
    ]) {
      if (
        !this.db
          .prepare(`PRAGMA table_info(${table})`)
          .all()
          .some((field) => field.name === column)
      )
        this.db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
    }
    // Migrate only once: restarting must never restore a revoked grant.
    if (
      !this.db
        .prepare(
          "SELECT name FROM sqlite_master WHERE type='table' AND name='dot_spaces'",
        )
        .get()
    ) {
      this.db.exec(`BEGIN;
        CREATE TABLE dot_spaces(dotId TEXT NOT NULL, spaceId TEXT NOT NULL, PRIMARY KEY(dotId, spaceId));
        INSERT INTO dot_spaces SELECT id, spaceId FROM dots;
        COMMIT;`);
    }
    this.computers = new ComputerStore(this.db);
    this.connections = new ConnectionStore(this.db);
    this.pages = new Pages(this.db, (id) =>
      this.spaces().some((space) => space.id === id),
    );
    if (
      !this.db
        .prepare('PRAGMA table_info(calls)')
        .all()
        .some((column) => column.name === 'anchorMessageId')
    )
      this.db.exec('ALTER TABLE calls ADD COLUMN anchorMessageId TEXT');
    if (!this.spaces().length) {
      const space = this.createSpace(
        'Everyday',
        'A little space for your day.',
      );
      this.createDot(
        space.id,
        'Dot',
        'Be thoughtful, practical, and concise. Help the user think clearly and follow through.',
        true,
        true,
      );
    }
  }
  close() {
    try {
      this.db.close();
    } catch {}
  }
  spaces(): Space[] {
    return this.db
      .prepare('SELECT * FROM spaces ORDER BY createdAt')
      .all() as unknown as Space[];
  }
  createSpace(name: string, description: string): Space {
    const space = {
      id: randomUUID(),
      name,
      description,
      createdAt: Date.now(),
    };
    this.db
      .prepare('INSERT INTO spaces VALUES (?, ?, ?, ?)')
      .run(space.id, name, description, space.createdAt);
    return space;
  }
  dots(includeSecrets = false): Dot[] {
    return this.db
      .prepare('SELECT * FROM dots ORDER BY createdAt')
      .all()
      .map((row: any) => {
        const d: Dot = {
          ...row,
          spaceIds: this.db
            .prepare(
              'SELECT spaceId FROM dot_spaces WHERE dotId=? ORDER BY spaceId',
            )
            .all(String(row.id))
            .map((grant: any) => String(grant.spaceId)),
          researchAllowed: !!row.researchAllowed,
          memoryAllowed: !!row.memoryAllowed,
          appsAllowed: !!row.appsAllowed,
          composioToolkits: JSON.parse(String(row.composioToolkits ?? '[]')),
          skillDeliveryEnabled: !!row.skillDeliveryEnabled,
          modelEndpoint: row.modelEndpoint ? String(row.modelEndpoint) : undefined,
          modelId: row.modelId ? String(row.modelId) : undefined,
          contextLimit:
            row.contextLimit !== null && row.contextLimit !== undefined
              ? Number(row.contextLimit)
              : undefined,
          maxCompletionTokens:
            row.maxCompletionTokens !== null &&
            row.maxCompletionTokens !== undefined
              ? Number(row.maxCompletionTokens)
              : undefined,
          apiKey: row.apiKey ? String(row.apiKey) : undefined,
          hasApiKey: Boolean(row.apiKey),
        };
        if (!includeSecrets) {
          delete (d as any).apiKey;
        }
        return d;
      });
  }
  dot(id: string, includeSecrets = true): Dot | null {
    return this.dots(includeSecrets).find((d) => d.id === id) ?? null;
  }
  createDot(
    spaceId: string,
    name: string,
    instructions: string,
    researchAllowed: boolean,
    memoryAllowed: boolean,
    spaceIds: string[] = [spaceId],
    learningContainerId: string | null = null,
    skillDeliveryEnabled = false,
    appsAllowed = false,
    composioToolkits: string[] = [],
    modelEndpoint?: string,
    modelId?: string,
    contextLimit?: number,
    maxCompletionTokens?: number,
    apiKey?: string,
  ): Dot {
    this.validateSpaceAccess(spaceId, spaceIds);
    validateLearningSettings(learningContainerId, skillDeliveryEnabled);
    const dot: Dot = {
      id: randomUUID(),
      spaceId,
      spaceIds: [...new Set(spaceIds)].sort(),
      name,
      instructions,
      researchAllowed,
      memoryAllowed,
      appsAllowed,
      composioToolkits: [...new Set(composioToolkits)].sort(),
      composioSessionId: null,
      composioPolicyHash: null,
      learningContainerId,
      skillDeliveryEnabled,
      modelEndpoint,
      modelId,
      contextLimit,
      maxCompletionTokens,
      apiKey,
      createdAt: Date.now(),
    };
    this.db.exec('BEGIN');
    try {
      this.db
        .prepare(
          'INSERT INTO dots (id, spaceId, name, instructions, researchAllowed, memoryAllowed, createdAt, learningContainerId, skillDeliveryEnabled, appsAllowed, composioToolkits, modelEndpoint, modelId, contextLimit, maxCompletionTokens, apiKey) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        )
        .run(
          dot.id,
          spaceId,
          name,
          instructions,
          +researchAllowed,
          +memoryAllowed,
          dot.createdAt,
          learningContainerId,
          +skillDeliveryEnabled,
          +appsAllowed,
          JSON.stringify(dot.composioToolkits),
          modelEndpoint ?? null,
          modelId ?? null,
          contextLimit ?? null,
          maxCompletionTokens ?? null,
          apiKey ?? null,
        );
      for (const id of dot.spaceIds)
        this.db.prepare('INSERT INTO dot_spaces VALUES (?, ?)').run(dot.id, id);
      this.db.exec('COMMIT');
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
    return dot;
  }
  canAccessSpace(dotId: string, spaceId: string) {
    return !!this.db
      .prepare('SELECT 1 FROM dot_spaces WHERE dotId=? AND spaceId=?')
      .get(dotId, spaceId);
  }
  private validateSpaceAccess(defaultSpace: string, spaceIds: string[]) {
    if (
      !spaceIds.includes(defaultSpace) ||
      spaceIds.some((id) => !this.spaces().some((space) => space.id === id))
    )
      throw new Error('Space access must include a valid default destination.');
  }
  updateDot(
    id: string,
    patch: Partial<
      Pick<
        Dot,
        | 'name'
        | 'instructions'
        | 'researchAllowed'
        | 'memoryAllowed'
        | 'appsAllowed'
        | 'composioToolkits'
        | 'modelEndpoint'
        | 'modelId'
        | 'contextLimit'
        | 'maxCompletionTokens'
        | 'apiKey'
      >
    > & {
      spaceId?: string;
      spaceIds?: string[];
      learningContainerId?: string | null;
      skillDeliveryEnabled?: boolean;
    },
  ): Dot {
    const current = this.dot(id);
    if (!current) throw new Error('Dot not found.');
    const defaultSpace = patch.spaceId ?? current.spaceId;
    const spaceIds = patch.spaceIds ?? current.spaceIds;
    this.validateSpaceAccess(defaultSpace, spaceIds);
    const learningContainerId =
      patch.learningContainerId === undefined
        ? (current.learningContainerId ?? null)
        : patch.learningContainerId;
    const skillDeliveryEnabled =
      patch.skillDeliveryEnabled ?? current.skillDeliveryEnabled ?? false;
    validateLearningSettings(learningContainerId, skillDeliveryEnabled);
    const name = patch.name ?? current.name;
    const instructions = patch.instructions ?? current.instructions;
    const researchAllowed =
      patch.researchAllowed !== undefined
        ? patch.researchAllowed
        : current.researchAllowed;
    const memoryAllowed =
      patch.memoryAllowed !== undefined
        ? patch.memoryAllowed
        : current.memoryAllowed;
    const appsAllowed =
      patch.appsAllowed !== undefined ? patch.appsAllowed : current.appsAllowed;
    const composioToolkits =
      patch.composioToolkits !== undefined
        ? patch.composioToolkits
        : current.composioToolkits;
    const modelEndpoint =
      patch.modelEndpoint !== undefined
        ? patch.modelEndpoint
        : current.modelEndpoint;
    const modelId =
      patch.modelId !== undefined ? patch.modelId : current.modelId;
    const contextLimit =
      patch.contextLimit !== undefined
        ? patch.contextLimit
        : current.contextLimit;
    const maxCompletionTokens =
      patch.maxCompletionTokens !== undefined
        ? patch.maxCompletionTokens
        : current.maxCompletionTokens;
    const apiKey =
      patch.apiKey !== undefined ? patch.apiKey : current.apiKey;

    this.db.exec('BEGIN');
    try {
      this.db
        .prepare(
          'UPDATE dots SET name=?, instructions=?, researchAllowed=?, memoryAllowed=?, learningContainerId=?, skillDeliveryEnabled=?, appsAllowed=?, composioToolkits=?, modelEndpoint=?, modelId=?, contextLimit=?, maxCompletionTokens=?, apiKey=? WHERE id=?',
        )
        .run(
          name,
          instructions,
          +researchAllowed,
          +memoryAllowed,
          learningContainerId,
          +skillDeliveryEnabled,
          +appsAllowed,
          JSON.stringify([...new Set(composioToolkits)].sort()),
          modelEndpoint ?? null,
          modelId ?? null,
          contextLimit ?? null,
          maxCompletionTokens ?? null,
          apiKey ?? null,
          id,
        );
      this.db
        .prepare('UPDATE dots SET spaceId=? WHERE id=?')
        .run(defaultSpace, id);
      this.db.prepare('DELETE FROM dot_spaces WHERE dotId=?').run(id);
      for (const space of new Set(spaceIds))
        this.db.prepare('INSERT INTO dot_spaces VALUES (?, ?)').run(id, space);
      this.db.exec('COMMIT');
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
    return this.dot(id)!;
  }
  saveComposioSession(id: string, sessionId: string, policyHash: string) {
    this.db
      .prepare(
        'UPDATE dots SET composioSessionId=?, composioPolicyHash=? WHERE id=?',
      )
      .run(sessionId, policyHash, id);
  }
  conversations(includeArchived = false): Conversation[] {
    const query = includeArchived
      ? 'SELECT * FROM thread_bindings WHERE ownerId=? ORDER BY COALESCE(updatedAt, createdAt) DESC'
      : 'SELECT * FROM thread_bindings WHERE ownerId=? AND archivedAt IS NULL ORDER BY COALESCE(updatedAt, createdAt) DESC';
    return this.db
      .prepare(query)
      .all(this.ownerId)
      .map((row: any) => ({
        ...row,
        metadata: row.metadata ? JSON.parse(row.metadata) : null,
      })) as unknown as Conversation[];
  }
  bindThread(id: string, dotId: string, title: string): Conversation {
    const dot = this.dot(dotId);
    if (!dot) throw new Error('Dot not found.');
    const now = Date.now();
    const value: Conversation = {
      id,
      dotId,
      ownerId: this.ownerId,
      title,
      createdAt: now,
      updatedAt: now,
      learningContainerId: dot.learningContainerId ?? null,
    };
    this.db
      .prepare(
        'INSERT INTO thread_bindings (id, dotId, ownerId, title, createdAt, updatedAt, learningContainerId) VALUES (?, ?, ?, ?, ?, ?, ?)',
      )
      .run(
        id,
        dotId,
        this.ownerId,
        title,
        value.createdAt,
        now,
        value.learningContainerId ?? null,
      );
    return value;
  }
  requireThread(
    id: string,
    dotId?: string,
    includeArchived = false,
  ): Conversation {
    const thread = this.conversations(includeArchived).find(
      (thread) => thread.id === id,
    );
    if (!thread || (dotId && thread.dotId !== dotId))
      throw new Error('Conversation does not belong to this Dot and owner.');
    return thread;
  }
  archiveThread(id: string) {
    this.requireThread(id, undefined, true);
    this.db
      .prepare('UPDATE thread_bindings SET archivedAt=?, updatedAt=? WHERE id=?')
      .run(Date.now(), Date.now(), id);
  }
  unarchiveThread(id: string) {
    this.requireThread(id, undefined, true);
    this.db
      .prepare(
        'UPDATE thread_bindings SET archivedAt=NULL, updatedAt=? WHERE id=?',
      )
      .run(Date.now(), id);
  }
  updateThreadTitle(id: string, title: string) {
    this.requireThread(id, undefined, true);
    this.db
      .prepare('UPDATE thread_bindings SET title=?, updatedAt=? WHERE id=?')
      .run(title, Date.now(), id);
  }
  touchThread(id: string) {
    this.db
      .prepare('UPDATE thread_bindings SET updatedAt=? WHERE id=?')
      .run(Date.now(), id);
  }
  bindTask(taskId: string, threadId: string) {
    this.requireThread(threadId);
    this.db
      .prepare('INSERT INTO task_threads VALUES (?, ?)')
      .run(taskId, threadId);
  }
  taskThread(taskId: string): string | undefined {
    const row = this.db
      .prepare('SELECT threadId FROM task_threads WHERE taskId=?')
      .get(taskId);
    return typeof row?.threadId === 'string' ? row.threadId : undefined;
  }
  calls(threadId?: string): CallReceipt[] {
    if (threadId) this.requireThread(threadId);
    return this.db
      .prepare(
        `SELECT * FROM calls ${threadId ? 'WHERE threadId=?' : ''} ORDER BY startedAt DESC`,
      )
      .all(...(threadId ? [threadId] : [])) as unknown as CallReceipt[];
  }
  createCall(threadId: string): CallReceipt {
    this.requireThread(threadId);
    const call: CallReceipt = {
      id: randomUUID(),
      threadId,
      startedAt: Date.now(),
      endedAt: null,
      status: 'connecting',
      transcript: '',
      error: null,
    };
    this.db
      .prepare(
        'INSERT INTO calls(id, threadId, startedAt, endedAt, status, transcript, error) VALUES (?, ?, ?, NULL, ?, ?, NULL)',
      )
      .run(call.id, threadId, call.startedAt, call.status, '');
    return call;
  }
  call(id: string): CallReceipt {
    const call = this.calls().find((call) => call.id === id);
    if (!call) throw new Error('Call not found.');
    this.requireThread(call.threadId);
    return call;
  }
  setCall(
    id: string,
    status: CallReceipt['status'],
    transcript: string,
    error: string | null = null,
  ) {
    const call = this.call(id);
    if (call.endedAt) return call;
    this.db
      .prepare(
        'UPDATE calls SET status=?, transcript=?, error=?, endedAt=? WHERE id=?',
      )
      .run(
        status,
        transcript,
        error,
        status === 'ended' || status === 'failed' ? Date.now() : null,
        id,
      );
    return this.call(id);
  }
  saveLateTranscript(id: string, transcript: string) {
    this.call(id);
    return (
      this.db
        .prepare(
          "UPDATE calls SET transcript=? WHERE id=? AND transcript='' AND endedAt IS NOT NULL",
        )
        .run(transcript, id).changes > 0
    );
  }
  anchorCall(id: string, anchor: string | undefined) {
    this.call(id);
    this.db
      .prepare('UPDATE calls SET anchorMessageId=? WHERE id=?')
      .run(anchor ?? null, id);
  }
  setCallError(id: string, error: string | null) {
    this.call(id);
    this.db.prepare('UPDATE calls SET error=? WHERE id=?').run(error, id);
  }
  saveCapture(threadId: string, value: unknown) {
    this.requireThread(threadId);
    this.db
      .prepare(
        'INSERT INTO captures VALUES (?, ?) ON CONFLICT(threadId) DO UPDATE SET value=excluded.value',
      )
      .run(threadId, JSON.stringify(value));
  }
  capture(threadId: string): unknown {
    this.requireThread(threadId);
    const row = this.db
      .prepare('SELECT value FROM captures WHERE threadId=?')
      .get(threadId);
    return typeof row?.value === 'string' ? JSON.parse(row.value) : null;
  }
  saveMessage(
    threadId: string,
    role: string,
    content: unknown,
    options?: {
      id?: string;
      runId?: string | null;
      toolCalls?: Array<{
        id: string;
        name?: string;
        args?: unknown;
        type?: 'function';
        function?: { name: string; arguments: string };
      }>;
      toolCallId?: string | null;
      status?: 'pending' | 'success' | 'failed' | 'cancelled';
      metadata?: Record<string, unknown> | null;
      createdAt?: number;
    },
  ): NativeMessage {
    const id = options?.id || randomUUID();
    const text = typeof content === 'string' ? content : JSON.stringify(content);
    const createdAt = options?.createdAt || Date.now();
    const runId = options?.runId ?? null;
    const formattedToolCalls = options?.toolCalls ? toAGUIToolCalls(options.toolCalls) : undefined;
    const toolCalls = formattedToolCalls ? JSON.stringify(formattedToolCalls) : null;
    const toolCallId = options?.toolCallId ?? null;
    const status = options?.status ?? null;
    const metadata = options?.metadata ? JSON.stringify(options.metadata) : null;

    const existing = this.db
      .prepare('SELECT id FROM thread_messages WHERE id=?')
      .get(id);

    if (existing) {
      this.db
        .prepare(
          'UPDATE thread_messages SET role=?, content=?, runId=?, toolCalls=?, toolCallId=?, status=?, metadata=? WHERE id=?',
        )
        .run(role, text, runId, toolCalls, toolCallId, status, metadata, id);
    } else {
      this.db
        .prepare(
          'INSERT INTO thread_messages (id, threadId, role, content, createdAt, runId, toolCalls, toolCallId, status, metadata) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        )
        .run(
          id,
          threadId,
          role,
          text,
          createdAt,
          runId,
          toolCalls,
          toolCallId,
          status,
          metadata,
        );
    }
    this.touchThread(threadId);
    return {
      id,
      threadId,
      role: role as NativeMessage['role'],
      content: text,
      createdAt,
      runId,
      toolCalls: formattedToolCalls,
      toolCallId,
      status: options?.status,
      metadata: options?.metadata,
    };
  }

  getNativeMessages(threadId: string): NativeMessage[] {
    const rows = this.db
      .prepare(
        'SELECT * FROM thread_messages WHERE threadId=? ORDER BY createdAt ASC, rowid ASC',
      )
      .all(threadId) as unknown as any[];
    return rows.map((r) => ({
      id: String(r.id),
      threadId: String(r.threadId),
      role: r.role as NativeMessage['role'],
      content: String(r.content),
      createdAt: Number(r.createdAt),
      runId: r.runId ? String(r.runId) : null,
      toolCalls: r.toolCalls ? toAGUIToolCalls(JSON.parse(r.toolCalls)) : undefined,
      toolCallId: r.toolCallId ? String(r.toolCallId) : null,
      status: r.status ? (r.status as NativeMessage['status']) : undefined,
      metadata: r.metadata ? JSON.parse(r.metadata) : null,
    }));
  }

  getMessages(threadId: string): { role: string; content?: unknown }[] {
    return this.getNativeMessages(threadId).map((m) => {
      let parsed: unknown = m.content;
      try {
        parsed = JSON.parse(m.content);
      } catch {}
      return { role: m.role, content: parsed };
    });
  }

  createRun(run: {
    id?: string;
    threadId: string;
    dotId: string;
    status?: NativeRun['status'];
    parentRunId?: string | null;
    metadata?: Record<string, unknown> | null;
  }): NativeRun {
    const id = run.id || randomUUID();
    const startedAt = Date.now();
    const existing = this.getRun(id);
    if (existing) {
      // Guard: do not clobber terminal runs (cancelled, failed, completed) back to running
      const isTerminal = ['completed', 'failed', 'cancelled'].includes(existing.status);
      const status = isTerminal ? existing.status : (run.status ?? existing.status);
      const parentRunId =
        run.parentRunId !== undefined ? run.parentRunId : existing.parentRunId;
      const metadata =
        run.metadata !== undefined ? run.metadata : existing.metadata;
      const metadataStr = metadata ? JSON.stringify(metadata) : null;
      this.db
        .prepare(
          'UPDATE runs SET threadId=?, dotId=?, parentRunId=?, status=?, startedAt=?, metadata=? WHERE id=?',
        )
        .run(
          run.threadId,
          run.dotId,
          parentRunId ?? null,
          status,
          existing.startedAt,
          metadataStr,
          id,
        );
      return {
        id,
        threadId: run.threadId,
        dotId: run.dotId,
        parentRunId: parentRunId ?? null,
        status,
        error: existing.error,
        startedAt: existing.startedAt,
        finishedAt: existing.finishedAt,
        metadata,
      };
    }

    const status = run.status ?? 'running';
    const metadataStr = run.metadata ? JSON.stringify(run.metadata) : null;
    const parentRunId = run.parentRunId ?? null;
    this.db
      .prepare(
        'INSERT INTO runs (id, threadId, dotId, parentRunId, status, error, startedAt, finishedAt, metadata) VALUES (?, ?, ?, ?, ?, NULL, ?, NULL, ?)',
      )
      .run(
        id,
        run.threadId,
        run.dotId,
        parentRunId,
        status,
        startedAt,
        metadataStr,
      );
    return {
      id,
      threadId: run.threadId,
      dotId: run.dotId,
      parentRunId,
      status,
      error: null,
      startedAt,
      finishedAt: null,
      metadata: run.metadata,
    };
  }

  updateRun(
    id: string,
    patch: Partial<
      Pick<NativeRun, 'status' | 'error' | 'finishedAt' | 'metadata'>
    >,
  ): NativeRun {
    const current = this.getRun(id);
    if (!current) throw new Error('Run not found.');
    // Guard terminal transitions: once a run is marked cancelled or failed, it cannot be overwritten by completed or running
    if (['cancelled', 'failed'].includes(current.status) && patch.status && patch.status !== current.status) {
      return current;
    }
    const status = patch.status ?? current.status;
    const error = patch.error !== undefined ? patch.error : current.error;
    const finishedAt =
      patch.finishedAt !== undefined ? patch.finishedAt : current.finishedAt;
    const metadata =
      patch.metadata !== undefined ? patch.metadata : current.metadata;
    const metadataStr = metadata ? JSON.stringify(metadata) : null;

    this.db
      .prepare(
        'UPDATE runs SET status=?, error=?, finishedAt=?, metadata=? WHERE id=?',
      )
      .run(status, error ?? null, finishedAt ?? null, metadataStr, id);

    return {
      ...current,
      status,
      error,
      finishedAt,
      metadata,
    };
  }

  getRun(id: string): NativeRun | null {
    const row = this.db
      .prepare('SELECT * FROM runs WHERE id=?')
      .get(id) as any;
    if (!row) return null;
    return {
      id: String(row.id),
      threadId: String(row.threadId),
      dotId: String(row.dotId),
      parentRunId: row.parentRunId ? String(row.parentRunId) : null,
      status: row.status as NativeRun['status'],
      error: row.error ? String(row.error) : null,
      startedAt: Number(row.startedAt),
      finishedAt: row.finishedAt ? Number(row.finishedAt) : null,
      metadata: row.metadata ? JSON.parse(row.metadata) : null,
    };
  }

  getActiveRun(threadId: string): NativeRun | null {
    const row = this.db
      .prepare(
        "SELECT * FROM runs WHERE threadId=? AND status IN ('queued', 'running') ORDER BY startedAt DESC LIMIT 1",
      )
      .get(threadId) as any;
    if (!row) return null;
    return {
      id: String(row.id),
      threadId: String(row.threadId),
      dotId: String(row.dotId),
      parentRunId: row.parentRunId ? String(row.parentRunId) : null,
      status: row.status as NativeRun['status'],
      error: row.error ? String(row.error) : null,
      startedAt: Number(row.startedAt),
      finishedAt: row.finishedAt ? Number(row.finishedAt) : null,
      metadata: row.metadata ? JSON.parse(row.metadata) : null,
    };
  }

  getRuns(threadId: string): NativeRun[] {
    const rows = this.db
      .prepare('SELECT * FROM runs WHERE threadId=? ORDER BY startedAt DESC')
      .all(threadId) as any[];
    return rows.map((row) => ({
      id: String(row.id),
      threadId: String(row.threadId),
      dotId: String(row.dotId),
      parentRunId: row.parentRunId ? String(row.parentRunId) : null,
      status: row.status as NativeRun['status'],
      error: row.error ? String(row.error) : null,
      startedAt: Number(row.startedAt),
      finishedAt: row.finishedAt ? Number(row.finishedAt) : null,
      metadata: row.metadata ? JSON.parse(row.metadata) : null,
    }));
  }

  cancelActiveRuns(threadId: string, error = 'Run cancelled.', excludeRunId?: string) {
    globalRunCoordinator.cancelThread(threadId, error, excludeRunId);
    if (excludeRunId) {
      this.db
        .prepare(
          "UPDATE runs SET status='cancelled', error=?, finishedAt=? WHERE threadId=? AND status IN ('queued', 'running') AND id != ?",
        )
        .run(error, Date.now(), threadId, excludeRunId);
    } else {
      this.db
        .prepare(
          "UPDATE runs SET status='cancelled', error=?, finishedAt=? WHERE threadId=? AND status IN ('queued', 'running')",
        )
        .run(error, Date.now(), threadId);
    }
  }

  createToolExecution(execution: {
    id?: string;
    runId: string;
    threadId: string;
    toolCallId?: string;
    toolName: string;
    args?: Record<string, unknown>;
    approvalRequired?: boolean;
    status?: NativeToolExecution['status'];
  }): NativeToolExecution {
    const id = execution.id || randomUUID();
    const createdAt = Date.now();
    const status =
      execution.status ??
      (execution.approvalRequired ? 'awaiting_approval' : 'pending');
    const safeArgs = execution.args ?? (execution as any).input ?? {};
    this.db
      .prepare(
        'INSERT INTO tool_executions (id, runId, threadId, toolName, toolCallId, args, result, status, approvalRequired, approved, error, createdAt, finishedAt) VALUES (?, ?, ?, ?, ?, ?, NULL, ?, ?, 0, NULL, ?, NULL)',
      )
      .run(
        id,
        execution.runId,
        execution.threadId,
        execution.toolName,
        execution.toolCallId ?? null,
        JSON.stringify(safeArgs),
        status,
        execution.approvalRequired ? 1 : 0,
        createdAt,
      );
    return {
      id,
      runId: execution.runId,
      threadId: execution.threadId,
      toolCallId: execution.toolCallId,
      toolName: execution.toolName,
      args: safeArgs,
      status,
      approvalRequired: !!execution.approvalRequired,
      approved: false,
      createdAt,
    };
  }

  updateToolExecution(
    id: string,
    patch: Partial<
      Pick<
        NativeToolExecution,
        'result' | 'status' | 'approved' | 'approvalRequired' | 'error' | 'finishedAt' | 'args'
      >
    >,
  ): NativeToolExecution {
    const current = this.getToolExecution(id);
    if (!current) throw new Error('Tool execution not found.');
    const result =
      patch.result !== undefined
        ? patch.result
        : (patch as any).output !== undefined
          ? (patch as any).output
          : current.result;
    const resultStr = result !== undefined ? JSON.stringify(result) : null;
    const status = patch.status ?? current.status;
    const approved =
      patch.approved !== undefined ? patch.approved : current.approved;
    const approvalRequired =
      patch.approvalRequired !== undefined ? patch.approvalRequired : current.approvalRequired;
    const error = patch.error !== undefined ? patch.error : current.error;
    const finishedAt =
      patch.finishedAt !== undefined ? patch.finishedAt : current.finishedAt;
    const args = patch.args !== undefined ? patch.args : current.args;
    const argsStr = args !== undefined ? JSON.stringify(args) : null;

    this.db
      .prepare(
        'UPDATE tool_executions SET result=?, status=?, approved=?, approvalRequired=?, error=?, finishedAt=?, args=COALESCE(?, args) WHERE id=?',
      )
      .run(resultStr ?? null, status, approved ? 1 : 0, approvalRequired ? 1 : 0, error ?? null, finishedAt ?? null, argsStr, id);

    return {
      ...current,
      args,
      result,
      status,
      approved,
      approvalRequired,
      error,
      finishedAt,
    };
  }

  getToolExecution(id: string): NativeToolExecution | null {
    const row = this.db
      .prepare('SELECT * FROM tool_executions WHERE id=?')
      .get(id) as any;
    if (!row) return null;
    return this.mapToolExecutionRow(row);
  }

  getToolExecutionByCallId(toolCallId: string): NativeToolExecution | null {
    const row = this.db
      .prepare(
        'SELECT * FROM tool_executions WHERE toolCallId=? ORDER BY createdAt DESC LIMIT 1',
      )
      .get(toolCallId) as any;
    if (!row) return null;
    return this.mapToolExecutionRow(row);
  }

  updateToolExecutionByCallId(
    toolCallId: string,
    patch: Partial<
      Pick<
        NativeToolExecution,
        'result' | 'status' | 'approved' | 'approvalRequired' | 'error' | 'finishedAt' | 'args'
      >
    >,
  ): NativeToolExecution | null {
    const current = this.getToolExecutionByCallId(toolCallId);
    if (!current) return null;
    return this.updateToolExecution(current.id, patch);
  }

  resolveToolExecution(
    threadId: string,
    toolCallId: string,
    options: {
      result?: unknown;
      approved?: boolean;
      status?: NativeToolExecution['status'];
      error?: string | null;
      finishedAt?: number;
    },
  ): NativeToolExecution | null {
    let row = this.db
      .prepare(
        'SELECT * FROM tool_executions WHERE threadId=? AND toolCallId=? ORDER BY createdAt DESC LIMIT 1',
      )
      .get(threadId, toolCallId) as any;
    if (!row) {
      row = this.db
        .prepare(
          'SELECT * FROM tool_executions WHERE toolCallId=? ORDER BY createdAt DESC LIMIT 1',
        )
        .get(toolCallId) as any;
    }
    if (!row) return null;

    const current = this.mapToolExecutionRow(row);
    const finishedAt = options.finishedAt ?? Date.now();
    const approved =
      options.approved !== undefined ? options.approved : current.approved;
    const status = options.status ?? (approved ? 'completed' : 'rejected');
    const result = options.result !== undefined ? options.result : current.result;
    const resultStr = result !== undefined ? JSON.stringify(result) : null;
    const error = (options.error !== undefined ? options.error : current.error) ?? null;

    this.db
      .prepare(
        'UPDATE tool_executions SET status=?, approved=?, result=?, error=?, finishedAt=? WHERE id=?',
      )
      .run(status, approved ? 1 : 0, resultStr, error, finishedAt, current.id);

    return {
      ...current,
      status,
      approved,
      result,
      error,
      finishedAt,
    };
  }

  private mapToolExecutionRow(row: any): NativeToolExecution {
    return {
      id: String(row.id),
      runId: String(row.runId),
      threadId: String(row.threadId),
      toolCallId: row.toolCallId ? String(row.toolCallId) : undefined,
      toolName: String(row.toolName),
      args: row.args ? JSON.parse(row.args) : {},
      result: row.result ? JSON.parse(row.result) : undefined,
      status: row.status as NativeToolExecution['status'],
      approvalRequired: Boolean(row.approvalRequired),
      approved: Boolean(row.approved),
      error: row.error ? String(row.error) : null,
      createdAt: Number(row.createdAt),
      finishedAt: row.finishedAt ? Number(row.finishedAt) : null,
    };
  }

  getToolExecutions(runOrThreadId: string): NativeToolExecution[] {
    const rows = this.db
      .prepare(
        'SELECT * FROM tool_executions WHERE runId=? OR threadId=? ORDER BY createdAt ASC',
      )
      .all(runOrThreadId, runOrThreadId) as any[];
    return rows.map((row) => this.mapToolExecutionRow(row));
  }
}
