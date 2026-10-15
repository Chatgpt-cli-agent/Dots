import { Hono } from 'hono';
import { z } from 'zod';
import type { Platform } from './platform.js';
import { PluginError } from './plugin-service.js';

export function pluginRoutes(platform: Platform) {
  const app = new Hono();
  app.get('/plugins', (c) => c.json(platform.plugins.list()));
  app.post('/plugins', async (c) => {
    const input = z
      .object({ path: z.string().trim().min(1).max(4096) })
      .strict()
      .safeParse(await c.req.json().catch(() => null));
    if (!input.success)
      return c.json({ error: 'Enter a local plugin folder path.' }, 400);
    return c.json(platform.plugins.install(input.data.path), 201);
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
  app.onError((error, c) =>
    c.json(
      {
        error:
          error instanceof PluginError
            ? error.message
            : 'Plugin operation failed.',
      },
      error.message === 'Plugin not found.' ? 404 : 400,
    ),
  );
  return app;
}
