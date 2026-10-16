import type { DatabaseSync } from 'node:sqlite';

// Both stores share one database in production. Older standalone workspaces
// stored chat runs under the scheduler's table name; retain those rows intact.
export function migrateNativeRuns(db: DatabaseSync) {
  const columns = db.prepare('PRAGMA table_info(runs)').all();
  if (!columns.some((column) => column.name === 'threadId')) return;
  db.exec('BEGIN IMMEDIATE');
  try {
    db.exec('ALTER TABLE runs RENAME TO native_runs');
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}
