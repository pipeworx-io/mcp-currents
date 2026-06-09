interface McpToolDefinition {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  };
}

interface McpToolExport {
  tools: McpToolDefinition[];
  callTool: (name: string, args: Record<string, unknown>) => Promise<unknown>;
  meter?: { credits: number };
  cost?: Record<string, unknown>;
  provider?: string;
}

/**
 * Currents MCP — wraps the Currents API (currentsapi.services)
 *
 * Global news from 70k+ sources in many languages.
 *
 * Tools:
 * - latest_news: most recent news articles, filterable by language/category
 * - search_news: keyword search across global news with rich filters
 * - list_categories: the set of category labels Currents supports
 *
 * Auth: Currents API key as the `apiKey` query param. Callers may pass their
 * own key via _apiKey (optional); the gateway injects the platform key
 * otherwise. _apiKey is never required.
 */


const BASE = 'https://api.currentsapi.services/v1';
const UA = 'pipeworx/1.0 (+https://pipeworx.io)';

const tools: McpToolExport['tools'] = [
  {
    name: 'latest_news',
    description:
      'Get the most recent global news articles from Currents (70k+ sources). Filter by language and category. Example: latest_news({ language: "en", category: "technology", limit: 15 })',
    inputSchema: {
      type: 'object',
      properties: {
        language: {
          type: 'string',
          description: 'Two-letter language code, e.g. "en", "es", "fr", "de". Default "en".',
        },
        category: {
          type: 'string',
          description:
            'Optional category filter, e.g. "technology", "business", "world", "sports". Use list_categories to see all options.',
        },
        limit: {
          type: 'number',
          description: 'Max number of articles to return (default 15, max 30).',
        },
        _apiKey: {
          type: 'string',
          description: 'Optional Currents API key (get one free at currentsapi.services). Omit to use the platform key.',
        },
      },
      required: [],
    },
  },
  {
    name: 'search_news',
    description:
      'Search global news by keyword across Currents (70k+ sources). Filter by language, category, country, and date range. Example: search_news({ keywords: "artificial intelligence", language: "en", limit: 15 })',
    inputSchema: {
      type: 'object',
      properties: {
        keywords: {
          type: 'string',
          description: 'Search query, e.g. "climate change", "artificial intelligence".',
        },
        language: {
          type: 'string',
          description: 'Two-letter language code, e.g. "en", "es", "fr". Default "en".',
        },
        category: {
          type: 'string',
          description: 'Optional category filter, e.g. "technology", "business". Use list_categories to see options.',
        },
        country: {
          type: 'string',
          description: 'Optional two-letter country code, e.g. "US", "GB", "FR".',
        },
        start_date: {
          type: 'string',
          description: 'Optional ISO 8601 start of date range, e.g. "2026-01-01T00:00:00".',
        },
        end_date: {
          type: 'string',
          description: 'Optional ISO 8601 end of date range, e.g. "2026-02-01T00:00:00".',
        },
        limit: {
          type: 'number',
          description: 'Max number of articles to return (default 15).',
        },
        _apiKey: {
          type: 'string',
          description: 'Optional Currents API key. Omit to use the platform key.',
        },
      },
      required: ['keywords'],
    },
  },
  {
    name: 'list_categories',
    description:
      'List the news category labels supported by Currents (e.g. technology, business, world, sports). Example: list_categories({})',
    inputSchema: {
      type: 'object',
      properties: {
        _apiKey: {
          type: 'string',
          description: 'Optional Currents API key. Omit to use the platform key.',
        },
      },
      required: [],
    },
  },
];

interface CurrentsArticle {
  id?: string;
  title?: string;
  description?: string;
  url?: string;
  author?: string;
  image?: string;
  language?: string;
  category?: string[];
  published?: string;
}

interface CurrentsResponse {
  status?: string;
  news?: CurrentsArticle[];
  categories?: string[];
  message?: string;
  msg?: string;
  error?: string;
}

function mapArticle(a: CurrentsArticle) {
  return {
    id: a.id,
    title: a.title,
    description: a.description,
    url: a.url,
    author: a.author,
    category: a.category,
    language: a.language,
    published: a.published,
  };
}

// Centralized fetch + envelope handling. Returns either the parsed data or an
// error object — never throws, so callTool can surface a clean { error }.
async function currentsFetch(
  path: string,
  params: Record<string, string>,
  apiKey: string,
): Promise<{ data?: CurrentsResponse; error?: Record<string, unknown> }> {
  const qs = new URLSearchParams();
  qs.set('apiKey', apiKey);
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== '') qs.set(k, v);
  }

  const res = await fetch(`${BASE}${path}?${qs.toString()}`, {
    headers: { 'User-Agent': UA, Accept: 'application/json' },
  });

  if (res.status === 429) {
    return { error: { error: 'Currents rate limit; try again later' } };
  }

  let data: CurrentsResponse | undefined;
  try {
    data = (await res.json()) as CurrentsResponse;
  } catch {
    data = undefined;
  }

  const detail = data?.message ?? data?.msg ?? data?.error;

  if (res.status === 401) {
    return { error: { error: 'Currents auth/request error', ...(detail ? { detail } : {}) } };
  }

  // available/categories returns { categories, status: "ok" } and lacks news;
  // any non-ok status (when present) is an auth/request failure.
  if (data?.status && data.status !== 'ok') {
    return { error: { error: 'Currents auth/request error', ...(detail ? { detail } : {}) } };
  }

  if (!res.ok) {
    return { error: { error: 'Currents auth/request error', ...(detail ? { detail } : {}) } };
  }

  return { data };
}

async function latestNews(args: Record<string, unknown>, apiKey: string) {
  const language = (args.language as string | undefined) ?? 'en';
  const category = args.category as string | undefined;
  let limit = (args.limit as number | undefined) ?? 15;
  if (typeof limit !== 'number' || isNaN(limit) || limit < 1) limit = 15;
  if (limit > 30) limit = 30;

  const params: Record<string, string> = {
    language,
    page_size: String(limit),
  };
  if (category) params.category = category;

  const { data, error } = await currentsFetch('/latest-news', params, apiKey);
  if (error) return error;

  const news = data?.news ?? [];
  const articles = news.slice(0, limit).map(mapArticle);
  return { count: articles.length, articles };
}

async function searchNews(args: Record<string, unknown>, apiKey: string) {
  const keywords = args.keywords as string | undefined;
  if (!keywords) {
    return { error: 'Currents search_news requires a `keywords` argument (e.g. "climate change").' };
  }
  const language = (args.language as string | undefined) ?? 'en';
  const category = args.category as string | undefined;
  const country = args.country as string | undefined;
  const startDate = args.start_date as string | undefined;
  const endDate = args.end_date as string | undefined;
  let limit = (args.limit as number | undefined) ?? 15;
  if (typeof limit !== 'number' || isNaN(limit) || limit < 1) limit = 15;

  const params: Record<string, string> = {
    keywords,
    language,
    page_size: String(limit),
  };
  if (category) params.category = category;
  if (country) params.country = country;
  if (startDate) params.start_date = startDate;
  if (endDate) params.end_date = endDate;

  const { data, error } = await currentsFetch('/search', params, apiKey);
  if (error) return error;

  const news = data?.news ?? [];
  const articles = news.slice(0, limit).map(mapArticle);
  return { keywords, count: articles.length, articles };
}

async function listCategories(apiKey: string) {
  const { data, error } = await currentsFetch('/available/categories', {}, apiKey);
  if (error) return error;
  return { categories: data?.categories ?? [] };
}

async function callTool(name: string, args: Record<string, unknown>): Promise<unknown> {
  const apiKey = args._apiKey as string | undefined;
  delete args._apiKey;

  if (!apiKey) {
    return { error: 'Currents requires an API key via _apiKey or the platform key' };
  }

  try {
    switch (name) {
      case 'latest_news':
        return await latestNews(args, apiKey);
      case 'search_news':
        return await searchNews(args, apiKey);
      case 'list_categories':
        return await listCategories(apiKey);
      default:
        return { error: `Unknown tool: ${name}` };
    }
  } catch (err) {
    return { error: `Currents request failed: ${err instanceof Error ? err.message : String(err)}` };
  }
}

export default { tools, callTool, meter: { credits: 1 } } satisfies McpToolExport;
