import { afterEach, expect, it, vi } from 'vitest';

const injected = vi.hoisted(() => ({ operation: '', hit: false }));
vi.mock('node:fs', async (importOriginal) => {
  const fs = await importOriginal<typeof import('node:fs')>();
  const fail = () => {
    injected.operation = '';
    injected.hit = true;
    throw new Error('Injected update filesystem failure');
  };
  return {
    ...fs,
    renameSync: (source: string, dest: string) => {
      if (
        injected.operation === 'backup-rename' &&
        /backup-[^/\\]+$/.test(dest)
      )
        fail();
      if (
        injected.operation === 'install-rename' &&
        /staging-[^/\\]+$/.test(source)
      )
        fail();
      return fs.renameSync(source, dest);
    },
    writeFileSync: (file: string, data: string) => {
      if (/journal-[^/\\]+\.json$/.test(String(file))) {
        const stage = JSON.parse(String(data)).stage;
        if (injected.operation === `journal-${stage}`) fail();
      }
      return fs.writeFileSync(file, data);
    },
    rmSync: (file: string, options?: import('node:fs').RmOptions) => {
      if (/backup-[^/\\]+$/.test(String(file))) {
        if (injected.operation === 'backup-cleanup') fail();
        if (injected.operation === 'partial-backup-cleanup') {
          // A recursive delete may fail after removing part of the backup.
          fs.rmSync(`${file}/skills/helper/SKILL.md`);
          fail();
        }
      }
      if (
        injected.operation === 'journal-cleanup' &&
        /journal-[^/\\]+\.json$/.test(String(file))
      )
        fail();
      return fs.rmSync(file, options);
    },
  };
});

import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { WorkspaceStore } from '../src/server/workspace.js';
import {
  PluginService,
  computePackageFingerprint,
} from '../src/server/plugin-service.js';

const cleanups: (() => void)[] = [];
afterEach(() => {
  injected.operation = '';
  injected.hit = false;
  vi.restoreAllMocks();
  cleanups
    .splice(0)
    .reverse()
    .forEach((close) => close());
});

function fixture() {
  const root = mkdtempSync(path.join(tmpdir(), 'dots-update-recovery-'));
  cleanups.push(() => rmSync(root, { recursive: true, force: true }));
  const database = path.join(root, 'workspace.sqlite');
  const workspace = new WorkspaceStore(database, 'owner');
  cleanups.push(() => workspace.close());
  const source = path.join(root, 'source');
  const library = path.join(root, 'installed');
  mkdirSync(path.join(source, 'skills/helper'), { recursive: true });
  const writeVersion = (version: string) => {
    writeFileSync(
      path.join(source, 'plugin.json'),
      JSON.stringify({
        name: 'recovery-fixture',
        version,
        skills: 'skills',
        mcpServers: {
          api: { url: 'http://fixture.invalid/mcp', requiresToken: true },
        },
      }),
    );
    writeFileSync(
      path.join(source, 'skills/helper/SKILL.md'),
      `Instructions for ${version}`,
    );
  };
  writeVersion('1.0.0');
  const service = new PluginService(workspace.plugins, library);
  const plugin = service.install(source);
  const dotId = workspace.dots()[0].id;
  service.assign(plugin.id, dotId, true);
  workspace.plugins.setServiceConfig(plugin.id, 'api', {
    token: 'fixture-only-token',
  });
  const dest = path.join(library, plugin.id);
  const backup = path.join(library, `backup-${plugin.id}`);
  const journal = path.join(library, `journal-${plugin.id}.json`);
  writeVersion('2.0.0');
  const assertVersion = (store: WorkspaceStore, version: string) => {
    const current = store.plugins.list()[0];
    expect(current.version).toBe(version);
    expect(current.dotIds).toEqual([dotId]);
    expect(current.packageFingerprint).toBe(computePackageFingerprint(dest));
    expect(
      JSON.parse(readFileSync(path.join(dest, 'plugin.json'), 'utf8')).version,
    ).toBe(version);
    expect(
      readFileSync(path.join(dest, 'skills/helper/SKILL.md'), 'utf8'),
    ).toBe(`Instructions for ${version}`);
    expect(store.plugins.getServiceCredentials(plugin.id, 'api')?.token).toBe(
      'fixture-only-token',
    );
  };
  const restart = (version: string) => {
    const reopened = new WorkspaceStore(database, 'owner');
    try {
      new PluginService(reopened.plugins, library);
      assertVersion(reopened, version);
      expect(existsSync(journal)).toBe(false);
      expect(existsSync(backup)).toBe(false);
    } finally {
      reopened.close();
    }
  };
  return {
    workspace,
    service,
    plugin,
    source,
    dest,
    backup,
    journal,
    assertVersion,
    restart,
  };
}

it.each([
  'journal-prepared',
  'backup-rename',
  'journal-backed_up',
  'install-rename',
  'journal-installed',
])(
  'restores the old installation after a pre-commit %s failure',
  (operation) => {
    const f = fixture();
    injected.operation = operation;
    expect(() => f.service.update(f.plugin.id, f.source)).toThrow(
      'Could not update',
    );
    expect(injected.hit).toBe(true);
    f.assertVersion(f.workspace, '1.0.0');
    f.restart('1.0.0');
  },
);

it('rolls back files, services, and registry if persistence fails before commit', () => {
  const f = fixture();
  vi.spyOn(f.workspace.plugins, 'upsertService').mockImplementationOnce(() => {
    throw new Error('Injected transaction failure');
  });
  expect(() => f.service.update(f.plugin.id, f.source)).toThrow(
    'Could not update',
  );
  f.assertVersion(f.workspace, '1.0.0');
  f.restart('1.0.0');
});

it.each(['backup-cleanup', 'partial-backup-cleanup', 'journal-cleanup'])(
  'keeps the committed installation and retries %s on restart',
  (operation) => {
    const f = fixture();
    injected.operation = operation;
    expect(f.service.update(f.plugin.id, f.source).version).toBe('2.0.0');
    expect(injected.hit).toBe(true);
    f.assertVersion(f.workspace, '2.0.0');
    expect(existsSync(f.journal)).toBe(true);
    f.restart('2.0.0');
  },
);
