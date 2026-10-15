import { randomUUID } from 'node:crypto';
import {
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
} from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import type { InstalledPlugin } from '../shared/plugin-types.js';
import type { PluginStore } from './plugin-store.js';
import type { SkillInfo } from './skills-service.js';

export class PluginError extends Error {}
const manifestSchema = z
  .object({
    name: z.string().regex(/^[a-z0-9][a-z0-9-]{0,63}$/),
    version: z.string().min(1).max(80),
    description: z.string().max(2000).default(''),
    skills: z.union([z.string(), z.array(z.string()).min(1).max(50)]),
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

export class PluginService {
  constructor(
    private store: PluginStore,
    private root: string,
  ) {}
  list() {
    return this.store.list();
  }
  private require(id: string) {
    const plugin = this.list().find((p) => p.id === id);
    if (!plugin) throw new PluginError('Plugin not found.');
    return plugin;
  }
  private folder(id: string) {
    if (!/^[0-9a-f-]{36}$/.test(id))
      throw new PluginError('Invalid plugin ID.');
    return path.resolve(this.root, id);
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
      let bytes = 0;
      let files = 0;
      const inspect = (dir: string) => {
        for (const name of readdirSync(dir)) {
          const file = path.join(dir, name);
          const stat = lstatSync(file);
          if (stat.isSymbolicLink())
            throw new PluginError(
              'Plugin packages cannot contain symbolic links or junctions.',
            );
          if (++files > 2000)
            throw new PluginError('Plugin has too many files.');
          if (stat.isDirectory()) inspect(file);
          else if (stat.isFile()) {
            bytes += stat.size;
            if (stat.size > 5_000_000 || bytes > 20_000_000)
              throw new PluginError(
                'Plugin exceeds the 5 MB file or 20 MB package limit.',
              );
          } else
            throw new PluginError('Plugin contains an unsupported file type.');
        }
      };
      inspect(sourceRoot);
      mkdirSync(path.resolve(this.root), { recursive: true });
      cpSync(sourceRoot, staging, { recursive: true, dereference: false });
      inspect(staging);
      const manifestFile = existsSync(
        path.join(staging, '.codex-plugin/plugin.json'),
      )
        ? '.codex-plugin/plugin.json'
        : 'plugin.json';
      const raw = JSON.parse(
        readFileSync(inside(staging, manifestFile), 'utf8'),
      );
      if (
        raw.mcpServers ||
        raw.apps ||
        raw.hooks ||
        existsSync(path.join(staging, '.mcp.json')) ||
        existsSync(path.join(staging, 'hooks'))
      )
        throw new PluginError(
          'This release supports skills and reference files. Tool servers and startup hooks are not supported yet.',
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
      const skills: InstalledPlugin['skills'] = [];
      const directories =
        typeof manifest.skills === 'string'
          ? [manifest.skills]
          : manifest.skills;
      const add = (directory: string) => {
        const full = inside(staging, directory);
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
          directory: path.relative(staging, full).split(path.sep).join('/'),
        });
      };
      for (const relative of directories) {
        const full = inside(staging, relative);
        if (!lstatSync(full).isDirectory())
          throw new PluginError('Skills path must point to a folder.');
        if (existsSync(path.join(full, 'SKILL.md'))) add(relative);
        else
          for (const entry of readdirSync(full, { withFileTypes: true }))
            if (entry.isDirectory() && !entry.name.startsWith('.'))
              add(`${relative.replace(/\/$/, '')}/${entry.name}`);
      }
      if (!skills.length)
        throw new PluginError(
          'No SKILL.md files found in the declared skills folders.',
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
      };
      this.store.add(plugin);
      return plugin;
    } catch (error) {
      if (existsSync(staging)) rmSync(staging, { recursive: true });
      if (error instanceof PluginError) throw error;
      throw new PluginError(
        'Could not install this folder. Check its manifest and readable skills files.',
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
  fingerprint(dotId: string) {
    return JSON.stringify(this.skills(dotId));
  }
}
