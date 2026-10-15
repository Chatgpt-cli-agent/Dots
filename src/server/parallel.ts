import { randomUUID } from 'node:crypto';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { z } from 'zod';

export type WebSearchProvider =
  | 'parallel'
  | 'browser'
  | 'searxng'
  | 'local'
  | 'disabled';
export interface WebConfig {
  webSearchProvider?: WebSearchProvider;
  parallelApiKey?: string;
}
export function webSearchProvider(value?: string): WebSearchProvider {
  if (!value) return 'parallel';
  if (
    value === 'parallel' ||
    value === 'browser' ||
    value === 'searxng' ||
    value === 'local' ||
    value === 'disabled'
  )
    return value;
  throw new Error(
    'WEB_SEARCH_PROVIDER must be parallel, browser, searxng, local, or disabled.',
  );
}
const source = z.object({
  url: z
    .string()
    .url()
    .refine((value) => {
      const url = new URL(value);
      return (
        ['http:', 'https:'].includes(url.protocol) &&
        !url.username &&
        !url.password
      );
    }),
  title: z.string().nullable().optional(),
  excerpts: z.array(z.string()).default([]),
});
export interface WebSource {
  title: string;
  url: string;
  text: string;
}
export function sourcesFromResult(
  result: unknown,
  warn: (message: string) => void = () => {},
): WebSource[] {
  const envelope = z
    .object({
      isError: z.boolean().optional(),
      structuredContent: z.unknown().optional(),
      content: z
        .array(z.object({ type: z.string(), text: z.string().optional() }))
        .optional(),
    })
    .parse(result);
  if (envelope.isError)
    throw new Error(
      'Parallel could not complete the web request. Retry later or check the provider quota.',
    );
  let data = envelope.structuredContent;
  if (!data) {
    const text = envelope.content?.find((item) => item.type === 'text')?.text;
    try {
      data = JSON.parse(text ?? '');
    } catch {
      throw new Error('Parallel returned an invalid response.');
    }
  }
  const parsed = z
    .object({
      results: z.array(z.unknown()),
      errors: z.array(z.unknown()).optional(),
      warnings: z.array(z.unknown()).nullable().optional(),
    })
    .parse(data);
  if (parsed.errors?.length)
    warn(
      `The provider reported ${parsed.errors.length} source extraction error(s); coverage is incomplete.`,
    );
  if (parsed.warnings?.length)
    warn(
      'The provider returned warnings; some source evidence may be incomplete.',
    );
  let discarded = 0;
  const seen = new Set<string>();
  const sources = parsed.results
    .flatMap((item) => {
      const parsedSource = source.safeParse(item);
      if (!parsedSource.success) {
        discarded++;
        return [];
      }
      const value = parsedSource.data;
      if (seen.has(value.url)) return [];
      if (!value.excerpts.some((text) => text.trim())) {
        discarded++;
        return [];
      }
      seen.add(value.url);
      return [
        {
          title: value.title || value.url,
          url: value.url,
          text: value.excerpts.join('\n').slice(0, 6000),
        },
      ];
    })
    .slice(0, 5);
  if (discarded)
    warn(
      `Skipped ${discarded} malformed or empty source result(s); coverage is incomplete.`,
    );
  return sources;
}
export async function localWebSources(
  request: {
    objective: string;
    urls?: string[];
    sessionId?: string;
    searchQueries?: string[];
    onWarning?: (message: string) => void;
  },
  signal: AbortSignal,
): Promise<WebSource[]> {
  signal.throwIfAborted();
  if (request.urls && request.urls.length > 0) {
    const results: WebSource[] = [];
    for (const rawUrl of request.urls.slice(0, 5)) {
      try {
        const fetchSignal = AbortSignal.any([
          signal,
          AbortSignal.timeout(12000),
        ]);
        const res = await fetch(rawUrl, {
          signal: fetchSignal,
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
          },
        });
        if (!res.ok) continue;
        const html = await res.text();
        const text = html
          .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, ' ')
          .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, ' ')
          .replace(/<[^>]+>/g, ' ')
          .replace(/\s+/g, ' ')
          .trim();
        results.push({
          title: rawUrl,
          url: rawUrl,
          text: text.slice(0, 6000),
        });
      } catch {}
    }
    if (results.length > 0) return results;
  }

  const queries = request.searchQueries?.length
    ? request.searchQueries
    : [request.objective];
  const query = queries[0] || request.objective;
  const searxUrl = `http://127.0.0.1:8888/search?q=${encodeURIComponent(query)}&format=json`;

  try {
    const fetchSignal = AbortSignal.any([signal, AbortSignal.timeout(8000)]);
    const res = await fetch(searxUrl, {
      signal: fetchSignal,
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
    });
    if (res.ok) {
      const data = (await res.json()) as any;
      const hits = (data.results || []).slice(0, 5);
      if (hits.length > 0) {
        return hits.map((r: any) => ({
          title: r.title || r.url,
          url: r.url,
          text: (r.content || r.title || '').slice(0, 2000),
        }));
      }
    }
  } catch {}

  try {
    const ddgUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
    const fetchSignal = AbortSignal.any([signal, AbortSignal.timeout(8000)]);
    const res = await fetch(ddgUrl, {
      signal: fetchSignal,
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
    });
    if (res.ok) {
      const html = await res.text();
      const text = html
        .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, ' ')
        .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, ' ')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
      return [
        {
          title: `Search: ${query}`,
          url: 'https://duckduckgo.com',
          text: text.slice(0, 3000),
        },
      ];
    }
  } catch {}

  return [];
}

export async function parallelSources(
  request: {
    objective: string;
    urls?: string[];
    sessionId?: string;
    searchQueries?: string[];
    onWarning?: (message: string) => void;
  },
  config: WebConfig,
  signal: AbortSignal,
): Promise<WebSource[]> {
  signal.throwIfAborted();
  if (config.webSearchProvider === 'disabled')
    throw new Error('Web research is disabled.');

  if (
    config.webSearchProvider === 'searxng' ||
    config.webSearchProvider === 'local'
  ) {
    return localWebSources(request, signal);
  }

  // MCP client for Parallel provider
  const client = new Client({ name: 'opendots', version: '0.1.0' });
  const boundedSignal = AbortSignal.any([signal, AbortSignal.timeout(60_000)]);
  const transport = new StreamableHTTPClientTransport(
    new URL('https://search.parallel.ai/mcp'),
    {
      requestInit: config.parallelApiKey
        ? { headers: { Authorization: `Bearer ${config.parallelApiKey}` } }
        : undefined,
      fetch: (url, init) =>
        fetch(url, {
          ...init,
          signal: AbortSignal.any([
            boundedSignal,
            ...(init?.signal ? [init.signal] : []),
          ]),
        }),
    },
  );
  const session_id = request.sessionId ?? randomUUID();
  const objective = request.objective;
  const search_queries = request.searchQueries ?? [objective];
  const warn = request.onWarning ?? (() => {});
  try {
    await client.connect(transport);
    let urls = request.urls;
    if (!urls?.length) {
      const found = sourcesFromResult(
        await client.callTool(
          {
            name: 'web_search',
            arguments: { objective, search_queries, session_id },
          },
          undefined,
          { signal: boundedSignal },
        ),
        warn,
      );
      urls = found.map((page) => page.url);
      if (!urls.length)
        throw new Error(
          'Parallel found no usable sources. Try a more specific research request.',
        );
    }
    for (const url of urls) source.shape.url.parse(url);
    const pages = sourcesFromResult(
      await client.callTool(
        {
          name: 'web_fetch',
          arguments: {
            urls: urls.slice(0, 5),
            objective:
              objective.length <= 200
                ? objective
                : 'Extract source evidence relevant to the supplied research queries.',
            search_queries,
            session_id,
          },
        },
        undefined,
        { signal: boundedSignal },
      ),
      warn,
    );
    if (urls.length > 5)
      warn('Only the first five URLs were read; coverage is limited.');
    if (pages.length < Math.min(urls.length, 5))
      warn('Some requested sources could not be read; coverage is incomplete.');
    boundedSignal.throwIfAborted();
    if (!pages.length)
      throw new Error('Parallel could not extract usable source evidence.');
    return pages;
  } catch (error: any) {
    if (error?.message?.startsWith('Parallel could not complete')) {
      throw error;
    }
    if (!config.parallelApiKey && !signal.aborted) {
      try {
        const local = await localWebSources(request, signal);
        if (local.length > 0) return local;
      } catch {}
    }
    throw error;
  } finally {
    await client.close().catch(() => {});
  }
}
