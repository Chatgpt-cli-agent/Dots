import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { Store } from '../src/server/store.js';
import { WorkspaceStore } from '../src/server/workspace.js';

for (const first of ['scheduler', 'workspace'] as const) {
  for (const legacy of [false, true]) {
    it(`shares a database with ${first} initialized first, legacy=${legacy}`, () => {
      const directory = mkdtempSync(join(tmpdir(), 'dots-shared-db-'));
      const filename = join(directory, 'dots.sqlite');
      let store: Store | undefined;
      let workspace: WorkspaceStore | undefined;
      try {
        if (legacy) {
          const db = new DatabaseSync(filename);
          db.exec(`CREATE TABLE runs(id TEXT PRIMARY KEY, threadId TEXT NOT NULL, dotId TEXT NOT NULL, parentRunId TEXT, status TEXT NOT NULL, error TEXT, startedAt INTEGER NOT NULL, finishedAt INTEGER, metadata TEXT);
            INSERT INTO runs VALUES ('legacy', 'thread-old', 'dot-old', NULL, 'completed', NULL, 1, 2, '{"preserve":true}');`);
          db.close();
        }
        if (first === 'scheduler') store = new Store(filename);
        workspace = new WorkspaceStore(filename, 'owner');
        store ??= new Store(filename);
        const dot = workspace.dots()[0];
        workspace.bindThread('thread-new', dot.id, 'Shared database');
        workspace.createRun({
          id: 'chat-run',
          threadId: 'thread-new',
          dotId: dot.id,
        });
        const task = store.createTask('Independent scheduled task');
        expect(store.claim()?.id).toBe(task.id);
        expect(workspace.getActiveRun('thread-new')?.id).toBe('chat-run');
        workspace.cancelActiveRuns('thread-new');
        expect(workspace.getRun('chat-run')?.status).toBe('cancelled');
        expect(store.task(task.id)?.status).toBe('running');
        if (legacy)
          expect(workspace.getRun('legacy')?.metadata).toEqual({
            preserve: true,
          });
        workspace.close();
        store.close();
        store = new Store(filename);
        workspace = new WorkspaceStore(filename, 'owner');
        expect(workspace.getRun('chat-run')?.status).toBe('cancelled');
        expect(store.task(task.id)?.status).toBe('running');
        if (legacy) expect(workspace.getRun('legacy')?.finishedAt).toBe(2);
      } finally {
        workspace?.close();
        store?.close();
        rmSync(directory, { recursive: true, force: true });
      }
    });
  }
}
