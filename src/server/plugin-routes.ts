import { Hono } from 'hono';
import { z } from 'zod';
import type { Platform } from './platform.js';
import { PluginError } from './plugin-service.js';

export function pluginRoutes(platform: Platform) {
  const app = new Hono();
  app.get('/plugins', (c) => c.json(platform.plugins.list()));

  app.post('/plugins/preview', async (c) => {
    const json = await c.req.json().catch(() => ({}));
    const pathVal =
      typeof json?.path === 'string'
        ? json.path
        : typeof json?.source === 'string'
          ? json.source
          : '';
    const input = z.string().trim().min(1).max(4096).safeParse(pathVal);
    if (!input.success)
      return c.json({ error: 'Enter a local plugin folder path.' }, 400);
    return c.json(platform.plugins.preview(input.data));
  });

  app.post('/plugins', async (c) => {
    const input = z
      .object({ path: z.string().trim().min(1).max(4096) })
      .strict()
      .safeParse(await c.req.json().catch(() => null));
    if (!input.success)
      return c.json({ error: 'Enter a local plugin folder path.' }, 400);
    return c.json(platform.plugins.install(input.data.path), 201);
  });

  app.post('/plugins/:id/update', async (c) => {
    const json = await c.req.json().catch(() => ({}));
    const pathVal =
      typeof json?.path === 'string'
        ? json.path
        : typeof json?.source === 'string'
          ? json.source
          : '';
    const input = z
      .object({
        path: z.string().trim().min(1).max(4096),
        expectedVersion: z.string().trim().min(1).max(80).optional(),
        expectedFingerprint: z.string().trim().length(64).optional(),
      })
      .safeParse({
        path: pathVal,
        expectedVersion: json?.expectedVersion,
        expectedFingerprint: json?.expectedFingerprint,
      });
    if (!input.success)
      return c.json({ error: 'Enter a local plugin folder path.' }, 400);
    return c.json(
      platform.plugins.update(c.req.param('id'), input.data.path, {
        expectedVersion: input.data.expectedVersion,
        expectedFingerprint: input.data.expectedFingerprint,
      }),
    );
  });

  app.patch('/plugins/:id', async (c) => {
    const input = z
      .object({ enabled: z.boolean() })
      .strict()
      .safeParse(await c.req.json().catch(() => null));
    if (!input.success)
      return c.json({ error: 'Choose whether the plugin is enabled.' }, 400);
    platform.plugins.enable(c.req.param('id'), input.data.enabled);
    return c.json({ ok: true });
  });

  app.put('/plugins/:id/dots/:dotId', async (c) => {
    const input = z
      .object({ assigned: z.boolean() })
      .strict()
      .safeParse(await c.req.json().catch(() => null));
    if (!input.success)
      return c.json({ error: 'Choose whether to assign this plugin.' }, 400);
    if (!platform.workspace.dot(c.req.param('dotId')))
      return c.json({ error: 'Dot not found.' }, 404);
    platform.plugins.assign(
      c.req.param('id'),
      c.req.param('dotId'),
      input.data.assigned,
    );
    return c.json({ ok: true });
  });

  app.delete('/plugins/:id', (c) => {
    platform.plugins.uninstall(c.req.param('id'));
    return c.json({ ok: true });
  });

  app.post('/plugins/:id/services/:name/config', async (c) => {
    const input = z
      .object({
        token: z.string().trim().max(4096).nullable().optional(),
        enabled: z.boolean().optional(),
      })
      .strict()
      .safeParse(await c.req.json().catch(() => null));
    if (!input.success)
      return c.json({ error: 'Invalid service configuration.' }, 400);
    const updated = await platform.plugins.setServiceConfig(
      c.req.param('id'),
      c.req.param('name'),
      input.data,
    );
    return c.json(updated);
  });

  app.post('/plugins/:id/services/:name/refresh', async (c) => {
    const updated = await platform.plugins.refreshService(
      c.req.param('id'),
      c.req.param('name'),
    );
    return c.json(updated);
  });

  app.patch('/plugins/:id/services/:name/tools/:toolName', async (c) => {
    const input = z
      .object({
        enabled: z.boolean().optional(),
        requiresApproval: z.boolean().optional(),
      })
      .strict()
      .safeParse(await c.req.json().catch(() => null));
    if (!input.success)
      return c.json({ error: 'Invalid tool configuration.' }, 400);
    const updated = platform.plugins.setServiceTool(
      c.req.param('id'),
      c.req.param('name'),
      c.req.param('toolName'),
      input.data,
    );
    return c.json(updated);
  });

  app.onError((error, c) =>
    c.json(
      {
        error:
          error instanceof PluginError
            ? error.message
            : error.message || 'Plugin operation failed.',
      },
      error.message === 'Plugin not found.' ? 404 : 400,
    ),
  );
  return app;
}
