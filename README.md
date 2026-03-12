# ✏️ Excalidraw MCP Enhanced

> The official Excalidraw MCP's streaming animations + a full 30-tool canvas toolkit with persistent state, real-time sync, and AI-driven diagram editing.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

## Why This Exists

The [official Excalidraw MCP](https://github.com/excalidraw/excalidraw-mcp) is beautiful — streaming draw-on animations, inline rendering via MCP Apps, camera control. But it's **stateless**. The AI generates a diagram and that's it.

The community project ([yctimlin/mcp_excalidraw](https://github.com/yctimlin/mcp_excalidraw)) adds persistent canvas, element CRUD, WebSocket sync, and 26+ tools — but lacks the official MCP's streaming polish.

**This project merges the best of both.**

### Comparison

| Feature | Official MCP | yctimlin/mcp_excalidraw | **This Project** |
|---------|:---:|:---:|:---:|
| Streaming draw-on animations | ✅ | ❌ | ✅ |
| MCP Apps inline rendering | ✅ | ❌ | ✅ |
| Persistent canvas | ❌ | ✅ | ✅ |
| Real-time WebSocket sync | ❌ | ✅ | ✅ |
| Element CRUD (create/read/update/delete) | ❌ | ✅ | ✅ |
| Scene awareness (AI sees canvas) | ❌ | ✅ | ✅ |
| Layout tools (align, distribute, group) | ❌ | ✅ | ✅ |
| File-backed persistence | ❌ | ❌ | ✅ |
| Export to Excalidraw URL | ✅ | ✅ | ✅ |
| Mermaid → Excalidraw conversion | ❌ | ✅ | ✅ |
| Snapshots (save/restore) | ❌ | ❌ | ✅ |
| Streaming + Canvas bridged | — | — | ✅ |
| Docker support | ❌ | ✅ | ✅ |

## Architecture

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│   MCP Client    │────▸│   MCP Server     │────▸│  Canvas Server  │
│ (Claude, Cursor,│stdio│  (tools/stdio)   │http │  (Express + WS) │
│  Codex, etc.)   │     │                  │     │  localhost:3000  │
└─────────────────┘     └──────────────────┘     └────────┬────────┘
                                                          │ WebSocket
                                                 ┌────────▼────────┐
                                                 │  Excalidraw UI  │
                                                 │  (browser tab)  │
                                                 └─────────────────┘
```

**Two processes:**
- **MCP Server** — stdio-based, exposes all tools to AI clients. The official streaming `create_view` + 27 canvas tools.
- **Canvas Server** — Express app serving the Excalidraw UI, REST API, and WebSocket for real-time sync. Persistent file-backed storage.

When the AI uses `create_view` (streaming mode), the output automatically syncs to the persistent canvas. Both modes work together seamlessly.

## Quick Start

### Prerequisites

- Node.js ≥ 18 (or Bun)
- pnpm (`npm install -g pnpm`)

### Local Setup

```bash
# Clone
git clone https://github.com/achen2089/excalidraw-mcp-enhanced.git
cd excalidraw-mcp-enhanced

# Install
pnpm install

# Build everything
pnpm build
pnpm build:canvas-ui

# Start the canvas server (persistent canvas + WebSocket)
pnpm canvas

# Open http://localhost:3000 in your browser
```

Then configure your MCP client (see below) to connect to the MCP server.

### Docker

```bash
docker build -t excalidraw-mcp-enhanced .
docker run -p 3000:3000 -v $(pwd)/canvas-state.json:/app/canvas-state.json excalidraw-mcp-enhanced
```

## MCP Client Configuration

### Claude Desktop

```json
{
  "mcpServers": {
    "excalidraw": {
      "command": "node",
      "args": ["<path-to>/excalidraw-mcp-enhanced/dist/index.js"],
      "env": {
        "EXPRESS_SERVER_URL": "http://localhost:3000"
      }
    }
  }
}
```

### Claude Code

```bash
claude mcp add excalidraw -- node <path-to>/excalidraw-mcp-enhanced/dist/index.js
```

### Cursor

In `.cursor/mcp.json`:
```json
{
  "mcpServers": {
    "excalidraw": {
      "command": "node",
      "args": ["<path-to>/excalidraw-mcp-enhanced/dist/index.js"],
      "env": {
        "EXPRESS_SERVER_URL": "http://localhost:3000"
      }
    }
  }
}
```

### Codex

```bash
codex --mcp-config '{"excalidraw":{"command":"node","args":["<path-to>/excalidraw-mcp-enhanced/dist/index.js"]}}'
```

### OpenCode

In `opencode.json`:
```json
{
  "mcp": {
    "excalidraw": {
      "command": "node",
      "args": ["<path-to>/excalidraw-mcp-enhanced/dist/index.js"],
      "env": {
        "EXPRESS_SERVER_URL": "http://localhost:3000"
      }
    }
  }
}
```

## Tool Reference

### Streaming & Reference (from official MCP)

| Tool | Description |
|------|-------------|
| `read_me` | Element format reference, color palettes, sizing rules, examples. Call before first `create_view`. |
| `create_view` | Streaming diagram with draw-on animations. Output auto-syncs to persistent canvas. |

### Element CRUD

| Tool | Description |
|------|-------------|
| `create_element` | Create a single element on the canvas |
| `batch_create_elements` | Create multiple elements at once |
| `get_element` | Read a single element by ID |
| `query_elements` | Query elements by type or properties |
| `update_element` | Update properties of an existing element |
| `delete_element` | Remove an element from the canvas |
| `duplicate_elements` | Clone elements with offset |

### Layout

| Tool | Description |
|------|-------------|
| `align_elements` | Align elements (left, center, right, top, middle, bottom) |
| `distribute_elements` | Evenly distribute elements horizontally or vertically |
| `group_elements` | Group elements together |
| `ungroup_elements` | Ungroup a group |
| `lock_elements` | Lock elements from editing |
| `unlock_elements` | Unlock elements |

### Scene Awareness

| Tool | Description |
|------|-------------|
| `describe_scene` | Structured text description of the canvas (types, positions, connections) |
| `get_canvas_screenshot` | Screenshot of current canvas as PNG (requires browser frontend) |

### File I/O & Export

| Tool | Description |
|------|-------------|
| `export_scene` | Export full `.excalidraw` JSON, optionally to file |
| `import_scene` | Import `.excalidraw` JSON (replace or merge mode) |
| `export_to_image` | Export as PNG or SVG, optionally to file |
| `export_to_excalidraw_url` | Upload canvas to excalidraw.com, return shareable URL |
| `create_from_mermaid` | Convert Mermaid syntax to Excalidraw elements on canvas |

### State Management

| Tool | Description |
|------|-------------|
| `clear_canvas` | Remove all elements |
| `snapshot_scene` | Save named snapshot of current state |
| `restore_snapshot` | Restore a previously saved snapshot |

### Viewport

| Tool | Description |
|------|-------------|
| `set_viewport` | Zoom-to-fit, center on element, or set zoom/scroll manually |

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `EXPRESS_SERVER_URL` | Canvas server URL for MCP tools | `http://localhost:3000` |
| `CANVAS_STORE_PATH` | Path to persistent JSON storage file | `./canvas-state.json` |
| `HOST` | Canvas server bind address | `0.0.0.0` |
| `PORT` | Canvas server port | `3000` |
| `ENABLE_CANVAS_SYNC` | Enable WebSocket sync | `true` |

## Two Rendering Modes

### Streaming Mode (`create_view`)
The official MCP's inline rendering with draw-on animations. Best for generating a complete diagram from a prompt. The output **automatically syncs** to the persistent canvas, so it appears in the browser tab too.

### Canvas Mode (all other tools)
Persistent live canvas with element-level CRUD. Best for iterative editing, inspection, and refinement. The AI can see what's on the canvas via `describe_scene` and make targeted changes.

Both modes coexist. The AI picks the right mode for the task, and they share the same persistent state.

## Development

```bash
# Dev mode with hot reload
pnpm dev           # MCP server with watch
pnpm canvas:dev    # Canvas server + Vite dev server

# Build
pnpm build              # MCP server
pnpm build:canvas-ui    # Canvas frontend
```

## Credits

- [excalidraw/excalidraw-mcp](https://github.com/excalidraw/excalidraw-mcp) — Official Excalidraw MCP with streaming animations
- [yctimlin/mcp_excalidraw](https://github.com/yctimlin/mcp_excalidraw) — Community canvas toolkit with 26 tools
- [Excalidraw](https://excalidraw.com) — The whiteboard that started it all

## License

MIT
