import { randomUUID } from 'node:crypto';
import {
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  realpathSync,
  renameSync,
  rmSync,
} from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import type {
  InstalledPlugin,
  InstalledPluginToolService,
  PluginPreview,
  PluginServiceDeclaration,
} from '../shared/plugin-types.js';
import type { Connection } from '../shared/connection-types.js';
import type { PluginStore } from './plugin-store.js';
import type { SkillInfo } from './skills-service.js';
import type { ConnectionService } from './connections.js';

export class PluginError extends Error {}

const manifestSchema = z
  .object({
    name: z.string().regex(/^[a-z0-9][a-z0-9-]{0,63}$/),
    version: z.string().min(1).max(80),
    description: z.string().max(2000).default(''),
    skills: z
      .union([z.string(), z.array(z.string()).min(1).max(50)])
      .optional(),
  })
  .passthrough();

export function inside(root: string, relative: string): string {
  if (
    !relative ||
    path.isAbsolute(relative) ||
    relative.includes('\\') ||
    relative.split('/').includes('..')
  )
    throw new PluginError('Use a relative path inside the package.');
  const target = path.resolve(root, relative);
  const rel = path.relative(root, target);
  if (rel.startsWith('..') || path.isAbsolute(rel))
    throw new PluginError('Package path leaves its folder.');
  return target;
}

function parseDeclaredServices(
  raw: any,
  dir: string,
): PluginServiceDeclaration[] {
  if (raw.apps) {
    throw new PluginError('Apps are not supported in plugins.');
  }
  if (raw.hooks || existsSync(path.join(dir, 'hooks'))) {
    throw new PluginError('Startup hooks are not supported.');
  }

  let mcpSource = raw.mcpServers;
  const mcpJsonPath = path.join(dir, '.mcp.json');
  if (existsSync(mcpJsonPath)) {
    try {
      const parsedMcp = JSON.parse(readFileSync(mcpJsonPath, 'utf8'));
      if (parsedMcp.hooks) {
        throw new PluginError('Startup hooks are not supported.');
      }
      if (parsedMcp.mcpServers) {
        mcpSource = { ...(mcpSource ?? {}), ...parsedMcp.mcpServers };
      }
    } catch (e) {
      if (e instanceof PluginError) throw e;
      throw new PluginError('Could not read .mcp.json in plugin package.');
    }
  }

  if (!mcpSource) return [];

  const rawList: { name: string; [key: string]: unknown }[] = [];
  if (Array.isArray(mcpSource)) {
    for (const item of mcpSource) {
      if (!item || typeof item !== 'object' || typeof item.name !== 'string') {
        throw new PluginError('MCP server declaration must have a name.');
      }
      rawList.push(item);
    }
  } else if (typeof mcpSource === 'object' && mcpSource !== null) {
    for (const [key, value] of Object.entries(mcpSource)) {
      if (!value || typeof value !== 'object') {
        throw new PluginError(`Invalid configuration for MCP server "${key}".`);
      }
      rawList.push({ name: key, ...(value as object) });
    }
  } else {
    throw new PluginError('mcpServers must be an object or array.');
  }

  const seen = new Set<string>();
  const services: PluginServiceDeclaration[] = [];

  for (const item of rawList) {
    const name = item.name.trim();
    if (!/^[a-zA-Z0-9_-]{1,64}$/.test(name)) {
      throw new PluginError(
        'Service names must contain only letters, numbers, hyphens, and underscores.',
      );
    }
    if (seen.has(name)) {
      throw new PluginError(`Duplicate service name "${name}" in plugin.`);
    }
    seen.add(name);

    if (
      item.command !== undefined ||
      item.args !== undefined ||
      item.type === 'stdio'
    ) {
      throw new PluginError(
        'Only http(s) MCP endpoints are supported. Subprocess and command transports are not permitted.',
      );
    }

    if (typeof item.url !== 'string' || !item.url.trim()) {
      throw new PluginError(`Service "${name}" requires a valid URL.`);
    }

    const urlStr = item.url.trim();
    if (urlStr.length > 2048) {
      throw new PluginError(`Service "${name}" URL exceeds 2048 characters.`);
    }

    let parsedUrl: URL;
    try {
      parsedUrl = new URL(urlStr);
    } catch {
      throw new PluginError(`Service "${name}" has an invalid URL.`);
    }

    if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
      throw new PluginError(
        `Service "${name}" must use http: or https: protocol.`,
      );
    }

    if (parsedUrl.username || parsedUrl.password) {
      throw new PluginError(
        'MCP endpoint URLs must not contain embedded credentials.',
      );
    }

    services.push({
      name,
      url: urlStr,
      description:
        typeof item.description === 'string'
          ? item.description.slice(0, 2000)
          : undefined,
      requiresToken: Boolean(item.requiresToken),
    });
  }

  return services;
}

function parseDeclaredSkills(
  manifestSkills: string | string[] | undefined,
  dir: string,
): InstalledPlugin['skills'] {
  if (!manifestSkills) return [];
  const skills: InstalledPlugin['skills'] = [];
  const directories =
    typeof manifestSkills === 'string' ? [manifestSkills] : manifestSkills;
  const add = (directory: string) => {
    const full = inside(dir, directory);
    const skillFile = path.join(full, 'SKILL.md');
    if (!existsSync(skillFile)) return;
    const name = path.basename(full);
    if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,99}$/.test(name))
      throw new PluginError(
        'Skill folders need simple names containing letters, numbers, underscores, or hyphens.',
      );
    if (skills.some((s) => s.name === name))
      throw new PluginError('Duplicate skill names in plugin.');
    const content = readFileSync(skillFile, 'utf8');
    skills.push({
      name,
      description:
        content.match(/^description:\s*([^\r\n]+)/m)?.[1]?.trim() ?? '',
      directory: path.relative(dir, full).split(path.sep).join('/'),
    });
  };
  for (const relative of directories) {
    const full = inside(dir, relative);
    if (!lstatSync(full).isDirectory())
      throw new PluginError('Skills path must point to a folder.');
    if (existsSync(path.join(full, 'SKILL.md'))) add(relative);
    else
      for (const entry of readdirSync(full, { withFileTypes: true }))
        if (entry.isDirectory() && !entry.name.startsWith('.'))
          add(`${relative.replace(/\/$/, '')}/${entry.name}`);
  }
  return skills;
}

export class PluginService {
  private connectionService?: ConnectionService;

  constructor(
    private store: PluginStore,
    private root: string,
    connectionService?: ConnectionService,
  ) {
    this.connectionService = connectionService;
  }

  setConnectionService(connectionService: ConnectionService) {
    this.connectionService = connectionService;
  }

  list() {
    return this.store.list();
  }

  private require(id: string) {
    const plugin = this.list().find((p) => p.id === id);
    if (!plugin) throw new PluginError('Plugin not found.');
    return plugin;
  }

  private folder(id: string) {
    if (!/^[0-9a-f-]{36}|staging-[0-9a-f-]{36}|backup-[0-9a-f-]{36}$/.test(id))
      throw new PluginError('Invalid plugin ID.');
    return path.resolve(this.root, id);
  }

  private inspect(dir: string) {
    let bytes = 0;
    let files = 0;
    const inspectDir = (currentDir: string) => {
      for (const name of readdirSync(currentDir)) {
        const file = path.join(currentDir, name);
        const stat = lstatSync(file);
        if (stat.isSymbolicLink())
          throw new PluginError(
            'Plugin packages cannot contain symbolic links or junctions.',
          );
        if (++files > 2000) throw new PluginError('Plugin has too many files.');
        if (stat.isDirectory()) inspectDir(file);
        else if (stat.isFile()) {
          bytes += stat.size;
          if (stat.size > 5_000_000 || bytes > 20_000_000)
            throw new PluginError(
              'Plugin exceeds the 5 MB file or 20 MB package limit.',
            );
        } else throw new PluginError('Plugin contains an unsupported file type.');
      }
    };
    inspectDir(dir);
  }

  preview(source: string): PluginPreview {
    const sourceRoot = realpathSync(source);
    if (!lstatSync(sourceRoot).isDirectory())
      throw new PluginError('Choose a plugin folder.');
    const managed = path.resolve(this.root);
    const overlap = path.relative(sourceRoot, managed);
    if (!overlap.startsWith('..') && !path.isAbsolute(overlap))
      throw new PluginError(
        'Choose a source folder outside the managed plugin library.',
      );
    this.inspect(sourceRoot);
    const manifestFile = existsSync(
      path.join(sourceRoot, '.codex-plugin/plugin.json'),
    )
      ? '.codex-plugin/plugin.json'
      : 'plugin.json';
    if (!existsSync(inside(sourceRoot, manifestFile)))
      throw new PluginError('Plugin manifest not found.');
    const raw = JSON.parse(
      readFileSync(inside(sourceRoot, manifestFile), 'utf8'),
    );
    const parsed = manifestSchema.safeParse(raw);
    if (!parsed.success)
      throw new PluginError(
        'Manifest needs a lowercase name, version, and relative skills path.',
      );
    const manifest = parsed.data;
    const services = parseDeclaredServices(raw, sourceRoot);
    const skills = parseDeclaredSkills(manifest.skills, sourceRoot);
    if (manifest.skills && !skills.length)
      throw new PluginError(
        'No SKILL.md files found in the declared skills folders.',
      );
    if (!skills.length && !services.length)
      throw new PluginError(
        'Plugin must declare at least one skill or MCP service.',
      );

    const existing = this.list().find((p) => p.name === manifest.name);
    return {
      name: manifest.name,
      version: manifest.version,
      description: manifest.description,
      skills: skills.map((s) => ({ name: s.name, description: s.description })),
      services: services.map((s) => ({
        name: s.name,
        url: s.url,
        description: s.description,
        requiresToken: s.requiresToken,
      })),
      requiredConfiguration: services
        .filter((s) => s.requiresToken)
        .map((s) => `Service "${s.name}" requires an API token.`),
      isUpdate: Boolean(existing),
      existingVersion: existing?.version,
    };
  }

  install(source: string): InstalledPlugin {
    const staging = this.folder(randomUUID());
    try {
      const sourceRoot = realpathSync(source);
      if (!lstatSync(sourceRoot).isDirectory())
        throw new PluginError('Choose a plugin folder.');
      const managed = path.resolve(this.root);
      const overlap = path.relative(sourceRoot, managed);
      if (!overlap.startsWith('..') && !path.isAbsolute(overlap))
        throw new PluginError(
          'Choose a source folder outside the managed plugin library.',
        );
      this.inspect(sourceRoot);
      mkdirSync(path.resolve(this.root), { recursive: true });
      cpSync(sourceRoot, staging, { recursive: true, dereference: false });
      this.inspect(staging);
      const manifestFile = existsSync(
        path.join(staging, '.codex-plugin/plugin.json'),
      )
        ? '.codex-plugin/plugin.json'
        : 'plugin.json';
      if (!existsSync(inside(staging, manifestFile)))
        throw new PluginError('Plugin manifest not found.');
      const raw = JSON.parse(
        readFileSync(inside(staging, manifestFile), 'utf8'),
      );
      const parsed = manifestSchema.safeParse(raw);
      if (!parsed.success)
        throw new PluginError(
          'Manifest needs a lowercase name, version, and relative skills path.',
        );
      const manifest = parsed.data;
      if (this.list().some((p) => p.name === manifest.name))
        throw new PluginError(
          'This plugin is already installed. Uninstall it before installing another version.',
        );
      const services = parseDeclaredServices(raw, staging);
      const skills = parseDeclaredSkills(manifest.skills, staging);
      if (manifest.skills && !skills.length)
        throw new PluginError(
          'No SKILL.md files found in the declared skills folders.',
        );
      if (!skills.length && !services.length)
        throw new PluginError(
          'Plugin must declare at least one skill or MCP service.',
        );
      const plugin: InstalledPlugin = {
        id: path.basename(staging),
        name: manifest.name,
        version: manifest.version,
        description: manifest.description,
        enabled: true,
        installedAt: Date.now(),
        skills,
        dotIds: [],
        services: [],
      };
      this.store.add(plugin);
      for (const s of services) {
        this.store.upsertService(plugin.id, s);
      }
      return this.require(plugin.id);
    } catch (error) {
      if (existsSync(staging)) rmSync(staging, { recursive: true, force: true });
      if (error instanceof PluginError) throw error;
      throw new PluginError(
        'Could not install this folder. Check its manifest and readable skills files.',
      );
    }
  }

  update(id: string, source: string): InstalledPlugin {
    const existing = this.require(id);
    const staging = this.folder(`staging-${randomUUID()}`);
    const backup = this.folder(`backup-${randomUUID()}`);
    const dest = this.folder(existing.id);
    try {
      const sourceRoot = realpathSync(source);
      if (!lstatSync(sourceRoot).isDirectory())
        throw new PluginError('Choose a plugin folder.');
      const managed = path.resolve(this.root);
      const overlap = path.relative(sourceRoot, managed);
      if (!overlap.startsWith('..') && !path.isAbsolute(overlap))
        throw new PluginError(
          'Choose a source folder outside the managed plugin library.',
        );
      this.inspect(sourceRoot);
      mkdirSync(path.resolve(this.root), { recursive: true });
      cpSync(sourceRoot, staging, { recursive: true, dereference: false });
      this.inspect(staging);
      const manifestFile = existsSync(
        path.join(staging, '.codex-plugin/plugin.json'),
      )
        ? '.codex-plugin/plugin.json'
        : 'plugin.json';
      if (!existsSync(inside(staging, manifestFile)))
        throw new PluginError('Plugin manifest not found.');
      const raw = JSON.parse(
        readFileSync(inside(staging, manifestFile), 'utf8'),
      );
      const parsed = manifestSchema.safeParse(raw);
      if (!parsed.success)
        throw new PluginError(
          'Manifest needs a lowercase name, version, and relative skills path.',
        );
      const manifest = parsed.data;
      if (manifest.name !== existing.name)
        throw new PluginError(
          'Updated package name must match the installed plugin name.',
        );
      const services = parseDeclaredServices(raw, staging);
      const skills = parseDeclaredSkills(manifest.skills, staging);
      if (manifest.skills && !skills.length)
        throw new PluginError(
          'No SKILL.md files found in the declared skills folders.',
        );
      if (!skills.length && !services.length)
        throw new PluginError(
          'Plugin must declare at least one skill or MCP service.',
        );

      if (existsSync(dest)) {
        renameSync(dest, backup);
      }
      try {
        renameSync(staging, dest);
      } catch (err) {
        if (existsSync(backup) && !existsSync(dest)) {
          renameSync(backup, dest);
        }
        throw err;
      }
      if (existsSync(backup)) {
        rmSync(backup, { recursive: true, force: true });
      }

      this.store.updateManifest(existing.id, {
        id: existing.id,
        name: manifest.name,
        version: manifest.version,
        description: manifest.description,
        installedAt: existing.installedAt,
        skills,
      });

      for (const s of services) {
        this.store.upsertService(existing.id, s);
      }
      this.store.deleteServicesExcept(
        existing.id,
        services.map((s) => s.name),
      );

      return this.require(existing.id);
    } catch (error) {
      if (existsSync(staging)) rmSync(staging, { recursive: true, force: true });
      if (existsSync(backup)) {
        if (!existsSync(dest)) {
          renameSync(backup, dest);
        } else {
          rmSync(backup, { recursive: true, force: true });
        }
      }
      if (error instanceof PluginError) throw error;
      throw new PluginError(
        'Could not update this plugin. Check its manifest and readable files.',
      );
    }
  }

  enable(id: string, enabled: boolean) {
    this.require(id);
    this.store.enable(id, enabled);
  }

  assign(id: string, dotId: string, assigned: boolean) {
    this.require(id);
    this.store.assign(id, dotId, assigned);
  }

  uninstall(id: string) {
    this.require(id);
    this.store.remove(id);
    // Keep unreferenced files for recovery; installation IDs are never reused.
  }

  skills(dotId: string): SkillInfo[] {
    return this.list()
      .filter((p) => p.enabled && p.dotIds.includes(dotId))
      .flatMap((p) =>
        p.skills.map((s) => ({
          name: `${p.name}:${s.name}`,
          description: s.description,
          directory: inside(this.folder(p.id), s.directory),
        })),
      );
  }

  connections(dotId: string): Connection[] {
    return this.list()
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

  fingerprint(dotId: string) {
    return this.store.fingerprint(dotId);
  }

  async setServiceConfig(
    pluginId: string,
    serviceName: string,
    patch: { token?: string | null; enabled?: boolean },
  ): Promise<InstalledPluginToolService> {
    this.require(pluginId);
    this.store.setServiceConfig(pluginId, serviceName, patch);
    if (this.connectionService && patch.token !== undefined) {
      await this.connectionService.refreshPluginService(pluginId, serviceName);
    }
    return this.store.getService(pluginId, serviceName)!;
  }

  async refreshService(
    pluginId: string,
    serviceName: string,
  ): Promise<InstalledPluginToolService> {
    this.require(pluginId);
    if (!this.connectionService)
      throw new PluginError('Connection service not configured.');
    return await this.connectionService.refreshPluginService(
      pluginId,
      serviceName,
    );
  }

  setServiceTool(
    pluginId: string,
    serviceName: string,
    toolName: string,
    patch: { enabled?: boolean; requiresApproval?: boolean },
  ): InstalledPluginToolService {
    this.require(pluginId);
    return this.store.setServiceTool(pluginId, serviceName, toolName, patch);
  }
}
