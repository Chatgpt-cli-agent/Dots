import { createHash, randomUUID } from 'node:crypto';
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
  writeFileSync,
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

export function computePackageFingerprint(dir: string): string {
  if (!existsSync(dir)) return '';
  const fileEntries: { relPath: string; hash: string }[] = [];
  const walk = (currentDir: string) => {
    const names = readdirSync(currentDir).sort();
    for (const name of names) {
      const fullPath = path.join(currentDir, name);
      const stat = lstatSync(fullPath);
      if (stat.isDirectory()) {
        walk(fullPath);
      } else if (stat.isFile()) {
        const relPath = path.relative(dir, fullPath).split(path.sep).join('/');
        const content = readFileSync(fullPath);
        const fileHash = createHash('sha256').update(content).digest('hex');
        fileEntries.push({ relPath, hash: fileHash });
      }
    }
  };
  walk(dir);
  fileEntries.sort((a, b) => a.relPath.localeCompare(b.relPath));
  const hasher = createHash('sha256');
  for (const entry of fileEntries) {
    hasher.update(`${entry.relPath}:${entry.hash}\n`);
  }
  return hasher.digest('hex');
}

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
    this.recoverStaleState();
  }

  recoverStaleState() {
    try {
      const rootPath = path.resolve(this.root);
      if (!existsSync(rootPath)) return;
      const entries = readdirSync(rootPath, { withFileTypes: true });

      // Clean up any lingering staging directories
      for (const entry of entries) {
        if (entry.isDirectory() && entry.name.startsWith('staging-')) {
          rmSync(path.join(rootPath, entry.name), {
            recursive: true,
            force: true,
          });
        }
      }

      // Recover or finalize from any update journals
      for (const entry of entries) {
        if (
          entry.isFile() &&
          entry.name.startsWith('journal-') &&
          entry.name.endsWith('.json')
        ) {
          const pluginId = entry.name.slice('journal-'.length, -'.json'.length);
          const journalPath = path.join(rootPath, entry.name);
          const backupDir = path.join(rootPath, `backup-${pluginId}`);
          const destDir = path.join(rootPath, pluginId);
          try {
            const journal = JSON.parse(readFileSync(journalPath, 'utf8'));
            const dbPlugin = this.store.list().find((p) => p.id === pluginId);
            if (
              dbPlugin &&
              dbPlugin.packageFingerprint &&
              dbPlugin.packageFingerprint === journal.toFingerprint
            ) {
              // Update successfully committed to database
              if (existsSync(backupDir)) {
                rmSync(backupDir, { recursive: true, force: true });
              }
            } else {
              // Update was not committed to database; rollback to backup
              if (existsSync(destDir)) {
                rmSync(destDir, { recursive: true, force: true });
              }
              if (existsSync(backupDir)) {
                renameSync(backupDir, destDir);
              }
            }
          } catch {}
          if (existsSync(journalPath)) {
            rmSync(journalPath, { force: true });
          }
        }
      }

      // Recover any remaining backup directories
      for (const entry of entries) {
        if (entry.isDirectory() && entry.name.startsWith('backup-')) {
          const pluginId = entry.name.replace(/^backup-/, '');
          const backupDir = path.join(rootPath, entry.name);
          const destDir = path.join(rootPath, pluginId);
          const dbPlugin = this.store.list().find((p) => p.id === pluginId);
          if (!dbPlugin) {
            rmSync(backupDir, { recursive: true, force: true });
            continue;
          }
          if (!existsSync(destDir)) {
            renameSync(backupDir, destDir);
            continue;
          }

          let destMatches = false;
          try {
            if (dbPlugin.packageFingerprint) {
              const destFingerprint = computePackageFingerprint(destDir);
              if (destFingerprint === dbPlugin.packageFingerprint) {
                destMatches = true;
              }
            }
          } catch {}

          if (destMatches) {
            rmSync(backupDir, { recursive: true, force: true });
          } else {
            rmSync(destDir, { recursive: true, force: true });
            renameSync(backupDir, destDir);
          }
        }
      }
    } catch {}
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
    if (
      !/^([0-9a-f-]{36}|staging-[0-9a-f-]{36}|backup-[0-9a-f-]{36})$/.test(id)
    )
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
    const requiredConfiguration: string[] = [];
    if (existing) {
      for (const service of services) {
        const existingService = existing.services.find(
          (s) => s.name === service.name,
        );
        if (existingService) {
          const urlChanged = existingService.url !== service.url;
          const authChanged =
            Boolean(existingService.requiresToken) !==
            Boolean(service.requiresToken);
          if (urlChanged || authChanged) {
            requiredConfiguration.push(
              `Service "${service.name}" endpoint or authentication changed; credentials and permissions will reset on update.`,
            );
          } else if (service.requiresToken && !existingService.hasToken) {
            requiredConfiguration.push(
              `Service "${service.name}" requires an API token.`,
            );
          }
        } else if (service.requiresToken) {
          requiredConfiguration.push(
            `Service "${service.name}" requires an API token.`,
          );
        }
      }
    } else {
      for (const service of services) {
        if (service.requiresToken) {
          requiredConfiguration.push(
            `Service "${service.name}" requires an API token.`,
          );
        }
      }
    }

    const packageFingerprint = computePackageFingerprint(sourceRoot);

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
      requiredConfiguration,
      isUpdate: Boolean(existing),
      existingVersion: existing?.version,
      packageFingerprint,
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
      const packageFingerprint = computePackageFingerprint(staging);
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
        packageFingerprint,
      };
      this.store.addPluginWithServices(plugin, services);
      return this.require(plugin.id);
    } catch (error) {
      if (existsSync(staging)) rmSync(staging, { recursive: true, force: true });
      if (error instanceof PluginError) throw error;
      throw new PluginError(
        'Could not install this folder. Check its manifest and readable skills files.',
      );
    }
  }

  update(
    id: string,
    source: string,
    options?: { expectedVersion?: string; expectedFingerprint?: string },
  ): InstalledPlugin {
    const existing = this.require(id);
    const staging = this.folder(`staging-${randomUUID()}`);
    const backup = this.folder(`backup-${existing.id}`);
    const dest = this.folder(existing.id);
    const journalPath = path.join(this.root, `journal-${existing.id}.json`);
    let swapped = false;
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

      if (
        options?.expectedVersion &&
        manifest.version !== options.expectedVersion
      ) {
        throw new PluginError(
          `Package version changed from ${options.expectedVersion} to ${manifest.version} since preview.`,
        );
      }
      const stagingFingerprint = computePackageFingerprint(staging);
      if (options?.expectedFingerprint) {
        if (stagingFingerprint !== options.expectedFingerprint) {
          throw new PluginError('Package contents changed since preview.');
        }
      }

      const fromFingerprint =
        existing.packageFingerprint ??
        (existsSync(dest) ? computePackageFingerprint(dest) : '');
      const toFingerprint = stagingFingerprint;

      writeFileSync(
        journalPath,
        JSON.stringify({
          pluginId: existing.id,
          stage: 'swapping',
          fromFingerprint,
          toFingerprint,
          timestamp: Date.now(),
        }),
      );

      if (existsSync(backup)) {
        rmSync(backup, { recursive: true, force: true });
      }
      if (existsSync(dest)) {
        renameSync(dest, backup);
      }
      renameSync(staging, dest);
      swapped = true;

      this.store.updatePluginAndServices(
        existing.id,
        {
          id: existing.id,
          name: manifest.name,
          version: manifest.version,
          description: manifest.description,
          installedAt: existing.installedAt,
          skills,
          packageFingerprint: toFingerprint,
        },
        services,
      );

      if (existsSync(backup)) {
        rmSync(backup, { recursive: true, force: true });
      }
      if (existsSync(journalPath)) {
        rmSync(journalPath, { force: true });
      }

      return this.require(existing.id);
    } catch (error) {
      if (swapped) {
        if (existsSync(dest)) {
          rmSync(dest, { recursive: true, force: true });
        }
        if (existsSync(backup)) {
          renameSync(backup, dest);
        }
      } else if (existsSync(backup) && !existsSync(dest)) {
        renameSync(backup, dest);
      }
      if (existsSync(journalPath)) {
        rmSync(journalPath, { force: true });
      }
      if (existsSync(staging)) {
        rmSync(staging, { recursive: true, force: true });
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
