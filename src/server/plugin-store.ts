import type { DatabaseSync } from 'node:sqlite';
import type { InstalledPlugin } from '../shared/plugin-types.js';

export class PluginStore {
  constructor(private db: DatabaseSync) {
    db.exec(`CREATE TABLE IF NOT EXISTS plugins(id TEXT PRIMARY KEY, name TEXT NOT NULL UNIQUE, manifest TEXT NOT NULL, enabled INTEGER NOT NULL DEFAULT 1);
      CREATE TABLE IF NOT EXISTS dot_plugins(dotId TEXT NOT NULL, pluginId TEXT NOT NULL, PRIMARY KEY(dotId,pluginId));`);
  }
  list(): InstalledPlugin[] {
    return this.db
      .prepare('SELECT * FROM plugins ORDER BY name')
      .all()
      .map((row) => ({
        ...JSON.parse(String(row.manifest)),
        enabled: Boolean(row.enabled),
        dotIds: this.db
          .prepare(
            'SELECT dotId FROM dot_plugins WHERE pluginId=? ORDER BY dotId',
          )
          .all(row.id)
          .map((r) => String(r.dotId)),
      }));
  }
  add(plugin: InstalledPlugin) {
    this.db
      .prepare('INSERT INTO plugins(id,name,manifest) VALUES (?,?,?)')
      .run(plugin.id, plugin.name, JSON.stringify(plugin));
  }
  enable(id: string, enabled: boolean) {
    this.db
      .prepare('UPDATE plugins SET enabled=? WHERE id=?')
      .run(Number(enabled), id);
  }
  assign(id: string, dotId: string, assigned: boolean) {
    if (assigned)
      this.db
        .prepare('INSERT OR IGNORE INTO dot_plugins VALUES (?,?)')
        .run(dotId, id);
    else
      this.db
        .prepare('DELETE FROM dot_plugins WHERE dotId=? AND pluginId=?')
        .run(dotId, id);
  }
  remove(id: string) {
    this.db.exec('BEGIN');
    try {
      this.db.prepare('DELETE FROM dot_plugins WHERE pluginId=?').run(id);
      this.db.prepare('DELETE FROM plugins WHERE id=?').run(id);
      this.db.exec('COMMIT');
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }
}
