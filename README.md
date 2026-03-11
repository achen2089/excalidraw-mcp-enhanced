# excalidraw-mcp-enhanced

Fork of the official [excalidraw/excalidraw-mcp](https://github.com/excalidraw/excalidraw-mcp) with a **persistent canvas toolkit** — element-level CRUD, real-time WebSocket sync, scene awareness, and a live shared canvas.

Merges the official MCP's streaming animations with [yctimlin/mcp_excalidraw](https://github.com/yctimlin/mcp_excalidraw)'s 26-tool canvas toolkit.

## Architecture

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│   MCP Client    │────▸│   MCP Server     │────▸│  Canvas Server  │
│ (Claude, Cursor)│stdio│  (tools/stdio)   │http │  (Express + WS) │
└─────────────────┘     └──────────────────┘     └────────┬────────┘
                                                          │ WebSocket
                                                 ┌────────▼────────┐
                                                 │  Excalidraw UI  │
                                                 │  (browser tab)  │
                                                 └─────────────────┘
```

**Two processes:**
- **Canvas server** (`npm run canvas`) — Express + WebSocket on port 3000. Serves the Excalidraw UI, REST API for element CRUD, real-time sync. File-backed persistent storage.
- **MCP server** (stdio) — All MCP tools. The official streaming tools (`read_me`, `create_view`, `export_to_excalidraw`) plus canvas CRUD tools that talk to the canvas server via HTTP.

## Quick Start

```bash
# Install
pnpm install

# Start canvas server (terminal 1)
npm run canvas

# Open browser to http://localhost:3000

# Configure your MCP client to use the MCP server (stdio)
# e.g. for Claude Desktop, add to config:
{
  "mcpServers": {
    "excalidraw": {
      "command": "node",
      "args": ["dist/index.js", "--stdio"],
      "env": {
        "EXPRESS_SERVER_URL": "http://localhost:3000"
      }
    }
  }
}
```

## Tools

### Official (preserved)
| Tool | Description |
|------|-------------|
| `read_me` | Element format reference, color palettes, tips |
| `create_view` | Streaming diagram with draw-on animations (MCP Apps inline) |
| `export_to_excalidraw` | Upload to excalidraw.com, return shareable URL |

### Canvas CRUD (new)
| Tool | Description |
|------|-------------|
| `create_element` | Create a single element on the persistent canvas |
| `batch_create_elements` | Create multiple elements at once |
| `get_element` | Read a single element by ID |
| `query_elements` | Query elements by type or properties |
| `update_element` | Update properties of an existing element |
| `delete_element` | Remove an element from the canvas |
| `duplicate_elements` | Clone elements with offset |

### Scene Awareness (new)
| Tool | Description |
|------|-------------|
| `describe_scene` | Structured text description of the canvas |
| `get_canvas_screenshot` | Screenshot of current canvas (returns PNG image) |

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `EXPRESS_SERVER_URL` | Canvas server URL (for MCP server) | `http://localhost:3000` |
| `CANVAS_STORE_PATH` | Path to persistent JSON store | `./canvas-state.json` |
| `HOST` | Canvas server bind address | `0.0.0.0` |
| `PORT` | Canvas server port | `3000` |

## Docker

```bash
docker-compose up
```

This starts both the canvas server (port 3000) and MCP server. Canvas state persists in a Docker volume.

## Development

```bash
# Canvas server with hot reload + Vite dev server for UI
npm run canvas:dev

# Build canvas UI
npm run build:canvas-ui

# Build MCP server
npm run build
```

## License

MIT
