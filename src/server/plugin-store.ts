import type { DatabaseSync } from 'node:sqlite';
import type {
  InstalledPlugin,
  InstalledPluginToolService,
} from '../shared/plugin-types.js';
import type { ConnectionTool } from '../shared/connection-types.js';

export class PluginStore {
  constructor(private db: DatabaseSync) {
    db.exec(`CREATE TABLE IF NOT EXISTS plugins(id TEXT PRIMARY KEY, name TEXT NOT NULL UNIQUE, manifest TEXT NOT NULL, enabled INTEGER NOT NULL DEFAULT 1);
      CREATE TABLE IF NOT EXISTS dot_plugins(dotId TEXT NOT NULL, pluginId TEXT NOT NULL, PRIMARY KEY(dotId,pluginId));
      CREATE TABLE IF NOT EXISTS plugin_services(
        pluginId TEXT NOT NULL,
        serviceName TEXT NOT NULL,
        url TEXT NOT NULL,
        description TEXT,
        requiresToken INTEGER NOT NULL DEFAULT 0,
        token TEXT,
        enabled INTEGER NOT NULL DEFAULT 1,
        tools TEXT NOT NULL DEFAULT '[]',
        error TEXT,
        updatedAt INTEGER NOT NULL,
        PRIMARY KEY(pluginId, serviceName)
      );`);
  }

  listServices(pluginId: string): InstalledPluginToolService[] {
    const rows = this.db
      .prepare(
        'SELECT serviceName, url, description, requiresToken, token, enabled, tools, error, updatedAt FROM plugin_services WHERE pluginId=? ORDER BY serviceName',
      )
      .all(pluginId) as any[];
    return rows.map((r) => ({
      name: String(r.serviceName),
      url: String(r.url),
      description: r.description ? String(r.description) : undefined,
      requiresToken: Boolean(r.requiresToken),
      hasToken: Boolean(r.token),
      enabled: Boolean(r.enabled),
      tools: JSON.parse(String(r.tools || '[]')) as ConnectionTool[],
      error: r.error ? String(r.error) : null,
      updatedAt: Number(r.updatedAt),
    }));
  }

  getService(
    pluginId: string,
    serviceName: string,
  ): InstalledPluginToolService | undefined {
    return this.listServices(pluginId).find((s) => s.name === serviceName);
  }

  getServiceCredentials(
    pluginId: string,
    serviceName: string,
  ): { url: string; token?: string } | undefined {
    const row = this.db
      .prepare(
        'SELECT url, token FROM plugin_services WHERE pluginId=? AND serviceName=?',
      )
      .get(pluginId, serviceName) as any;
    if (!row) return undefined;
    return {
      url: String(row.url),
      token: row.token ? String(row.token) : undefined,
    };
  }

  upsertService(
    pluginId: string,
    service: {
      name: string;
      url: string;
      description?: string;
      requiresToken?: boolean;
    },
  ) {
    const existing = this.db
      .prepare(
        'SELECT * FROM plugin_services WHERE pluginId=? AND serviceName=?',
      )
      .get(pluginId, service.name) as any;
    const now = Date.now();
    if (existing) {
      const urlChanged = String(existing.url) !== service.url;
      const authChanged =
        Boolean(existing.requiresToken) !== Boolean(service.requiresToken);
      if (urlChanged || authChanged) {
        // Endpoint or auth changed: reset credentials and cached policy, disable service
        this.db
          .prepare(
            'UPDATE plugin_services SET url=?, description=?, requiresToken=?, token=NULL, enabled=0, tools=?, error=NULL, updatedAt=? WHERE pluginId=? AND serviceName=?',
          )
          .run(
            service.url,
            service.description ?? null,
            service.requiresToken ? 1 : 0,
            '[]',
            now,
            pluginId,
            service.name,
          );
      } else {
        // Unchanged endpoint identity: preserve token, enabled, tools, error
        this.db
          .prepare(
            'UPDATE plugin_services SET description=?, updatedAt=? WHERE pluginId=? AND serviceName=?',
          )
          .run(service.description ?? null, now, pluginId, service.name);
      }
    } else {
      this.db
        .prepare(
          'INSERT INTO plugin_services(pluginId, serviceName, url, description, requiresToken, token, enabled, tools, error, updatedAt) VALUES (?, ?, ?, ?, ?, NULL, 1, ?, NULL, ?)',
        )
        .run(
          pluginId,
          service.name,
          service.url,
          service.description ?? null,
          service.requiresToken ? 1 : 0,
          '[]',
          now,
        );
    }
  }

  setServiceConfig(
    pluginId: string,
    serviceName: string,
    patch: { token?: string | null; enabled?: boolean },
  ) {
    const existing = this.getService(pluginId, serviceName);
    if (!existing) throw new Error('Plugin service not found.');
    const now = Math.max(Date.now(), existing.updatedAt + 1);

    if (patch.token !== undefined && patch.enabled !== undefined) {
      this.db
        .prepare(
          'UPDATE plugin_services SET token=?, enabled=?, updatedAt=? WHERE pluginId=? AND serviceName=?',
        )
        .run(patch.token || null, patch.enabled ? 1 : 0, now, pluginId, serviceName);
    } else if (patch.token !== undefined) {
      this.db
        .prepare(
          'UPDATE plugin_services SET token=?, updatedAt=? WHERE pluginId=? AND serviceName=?',
        )
        .run(patch.token || null, now, pluginId, serviceName);
    } else if (patch.enabled !== undefined) {
      this.db
        .prepare(
          'UPDATE plugin_services SET enabled=?, updatedAt=? WHERE pluginId=? AND serviceName=?',
        )
        .run(patch.enabled ? 1 : 0, now, pluginId, serviceName);
    }
    return this.getService(pluginId, serviceName)!;
  }

  setServiceTools(
    pluginId: string,
    serviceName: string,
    tools: ConnectionTool[],
    error: string | null = null,
  ) {
    const existing = this.getService(pluginId, serviceName);
    if (!existing) throw new Error('Plugin service not found.');
    const now = Math.max(Date.now(), existing.updatedAt + 1);
    this.db
      .prepare(
        'UPDATE plugin_services SET tools=?, error=?, updatedAt=? WHERE pluginId=? AND serviceName=?',
      )
      .run(JSON.stringify(tools), error, now, pluginId, serviceName);
    return this.getService(pluginId, serviceName)!;
  }

  setServiceTool(
    pluginId: string,
    serviceName: string,
    toolName: string,
    patch: { enabled?: boolean; requiresApproval?: boolean },
  ) {
    const service = this.getService(pluginId, serviceName);
    if (!service) throw new Error('Plugin service not found.');
    const updatedTools = service.tools.map((t) =>
      t.name === toolName ? { ...t, ...patch } : t,
    );
    return this.setServiceTools(pluginId, serviceName, updatedTools, service.error);
  }

  deleteServicesExcept(pluginId: string, serviceNames: string[]) {
    if (!serviceNames.length) {
      this.db
        .prepare('DELETE FROM plugin_services WHERE pluginId=?')
        .run(pluginId);
      return;
    }
    const placeholders = serviceNames.map(() => '?').join(',');
    this.db
      .prepare(
        `DELETE FROM plugin_services WHERE pluginId=? AND serviceName NOT IN (${placeholders})`,
      )
      .run(pluginId, ...serviceNames);
  }

  list(): InstalledPlugin[] {
    return this.db
      .prepare('SELECT * FROM plugins ORDER BY name')
      .all()
      .map((row: any) => ({
        ...JSON.parse(String(row.manifest)),
        enabled: Boolean(row.enabled),
        dotIds: this.db
          .prepare(
            'SELECT dotId FROM dot_plugins WHERE pluginId=? ORDER BY dotId',
          )
          .all(row.id)
          .map((r: any) => String(r.dotId)),
        services: this.listServices(row.id),
      }));
  }

  add(plugin: InstalledPlugin) {
    this.addPluginWithServices(plugin, plugin.services ?? []);
  }

  addPluginWithServices(
    plugin: InstalledPlugin,
    services: {
      name: string;
      url: string;
      description?: string;
      requiresToken?: boolean;
    }[],
  ) {
    this.db.exec('BEGIN');
    try {
      this.db
        .prepare('INSERT INTO plugins(id,name,manifest) VALUES (?,?,?)')
        .run(plugin.id, plugin.name, JSON.stringify(plugin));
      for (const s of services) {
        this.upsertService(plugin.id, s);
      }
      this.db.exec('COMMIT');
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }

  updatePluginAndServices(
    id: string,
    manifest: Omit<InstalledPlugin, 'enabled' | 'dotIds' | 'services'>,
    services: {
      name: string;
      url: string;
      description?: string;
      requiresToken?: boolean;
    }[],
  ) {
    this.db.exec('BEGIN');
    try {
      this.updateManifest(id, manifest);
      for (const s of services) {
        this.upsertService(id, s);
      }
      this.deleteServicesExcept(
        id,
        services.map((s) => s.name),
      );
      this.db.exec('COMMIT');
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }

  updateManifest(
    id: string,
    manifest: Omit<InstalledPlugin, 'enabled' | 'dotIds' | 'services'>,
  ) {
    this.db
      .prepare('UPDATE plugins SET manifest=? WHERE id=?')
      .run(JSON.stringify(manifest), id);
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
      this.db.prepare('DELETE FROM plugin_services WHERE pluginId=?').run(id);
      this.db.prepare('DELETE FROM plugins WHERE id=?').run(id);
      this.db.exec('COMMIT');
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }

  fingerprint(dotId?: string): string {
    const plugins = this.list().filter(
      (p) => p.enabled && (!dotId || p.dotIds.includes(dotId)),
    );
    const parts = plugins.map((p) => {
      const svcParts = p.services
        .filter((s) => s.enabled)
        .map(
          (s) =>
            `${s.name}:${s.updatedAt}:${s.hasToken}:${JSON.stringify(
              s.tools.map((t) => `${t.name}:${t.enabled}:${t.requiresApproval}`),
            )}`,
        );
      const skillParts = p.skills.map((s) => s.name).join(',');
      return `${p.id}:${p.version}:${p.enabled}:${p.dotIds.join(',')}:${skillParts}:${svcParts.join(';')}`;
    });
    return parts.join('|');
  }
}

