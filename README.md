# mcp-currents

Currents MCP — wraps the Currents API (currentsapi.services)

Part of [Pipeworx](https://pipeworx.io) — an MCP gateway connecting AI agents to 1394+ live data sources.

## Tools

| Tool | Description |
|------|-------------|
| `latest_news` | Get the most recent global news articles from Currents (70k+ sources). Filter by language and category. Example: latest_news({ language: "en", category: "technology", limit: 15 }) |
| `search_news` | Search global news by keyword across Currents (70k+ sources). Filter by language, category, country, and date range. Example: search_news({ keywords: "artificial intelligence", language: "en", limit: 15 }) |
| `list_categories` | List the news category labels supported by Currents (e.g. technology, business, world, sports). Example: list_categories({}) |

## Quick Start

Add to your MCP client (Claude Desktop, Cursor, Windsurf, etc.):

```json
{
  "mcpServers": {
    "currents": {
      "url": "https://gateway.pipeworx.io/currents/mcp"
    }
  }
}
```

Or connect to the full Pipeworx gateway for access to all 1394+ data sources:

```json
{
  "mcpServers": {
    "pipeworx": {
      "url": "https://gateway.pipeworx.io/mcp"
    }
  }
}
```

## Using with ask_pipeworx

Instead of calling tools directly, you can ask questions in plain English:

```
ask_pipeworx({ question: "your question about Currents data" })
```

The gateway picks the right tool and fills the arguments automatically.

## More

- [Docs and guides](https://pipeworx.io/docs)
- [pipeworx.io](https://pipeworx.io)

## License

MIT
