# excalidraw-mcp-enhanced — Spec

**Owner:** Anthony (achen2089)
**Repo:** `achen2089/excalidraw-mcp-enhanced`
**Base:** Fork of `excalidraw/excalidraw-mcp`
**Reference:** `yctimlin/mcp_excalidraw` (26-tool canvas toolkit)
**Deployment:** Mac mini (Docker)
**Status:** Spec

---

## One Liner

The official Excalidraw MCP's polish + a full canvas toolkit with persistent shared state, real-time sync, and 26+ tools for AI agents to build, inspect, and iteratively refine diagrams.

## Problem

The official Excalidraw MCP is beautiful — streaming animations, inline rendering, camera control — but it's **stateless and one-directional**. The AI generates a diagram and that's it. No persistent canvas, no element-level editing, no way for the AI to see what it drew, no shared workspace.

The community project (`yctimlin/mcp_excalidraw`) solves all of that with 26 tools, WebSocket sync, and a live canvas — but lacks the official MCP's streaming polish and MCP Apps integration.

This project merges the best of both.

## Goals

1. **Shared live canvas** — AI and human on the same board, real-time sync via WebSocket
2. **Full element control** — create, read, update, delete individual elements (not just regenerate everything)
3. **AI sees the canvas** — scene descriptions and screenshots so the AI can inspect and iterate
4. **Streaming polish** — keep the official MCP's draw-on animations and inline rendering
5. **Persistent state** — diagrams survive server restarts
6. **Easy export** — shareable Excalidraw URLs, `.excalidraw` JSON files, PNG/SVG images

## Non-Goals

- Excalidraw+ account auth/integration (export URLs are sufficient)
- Multi-user collaboration (just Anthony + AI agents)
- Public-facing web app
- Mobile support

---

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
- **Canvas server** — Express app serving the Excalidraw UI + REST API + WebSocket for real-time element sync. Persistent storage (file-backed JSON).
- **MCP server** — stdio-based MCP server exposing all tools. Communicates with canvas server via HTTP/WS.

The official MCP's `create_view` streaming + MCP Apps inline rendering is preserved as an additional tool alongside the canvas toolkit.

---

## Tools (26 + official)

### From official Excalidraw MCP (preserved)
| Tool | Description |
|------|-------------|
| `read_me` | Element format reference, color palettes, tips |
| `create_view` | Streaming diagram with draw-on animations (MCP Apps inline) |
| `export_to_excalidraw` | Upload to excalidraw.com, return shareable URL |

### Element CRUD
| Tool | Description |
|------|-------------|
| `create_element` | Create a single element on the canvas |
| `batch_create_elements` | Create multiple elements at once |
| `get_element` | Read a single element by ID |
| `query_elements` | Query elements by type, position, or properties |
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
| `describe_scene` | Structured text description of everything on the canvas |
| `get_canvas_screenshot` | Screenshot of current canvas state (returns image) |

### File I/O & Export
| Tool | Description |
|------|-------------|
| `export_scene` | Export full `.excalidraw` JSON |
| `import_scene` | Import `.excalidraw` JSON onto canvas |
| `export_to_image` | Export as PNG or SVG |
| `export_to_excalidraw_url` | Upload and return shareable excalidraw.com URL |
| `create_from_mermaid` | Convert Mermaid syntax to Excalidraw elements |

### State Management
| Tool | Description |
|------|-------------|
| `clear_canvas` | Remove all elements |
| `snapshot_scene` | Save named snapshot of current state |
| `restore_snapshot` | Restore a previously saved snapshot |

### Viewport
| Tool | Description |
|------|-------------|
| `set_viewport` | Zoom-to-fit, center on element, or manual zoom/offset |

### Design Guide
| Tool | Description |
|------|-------------|
| `read_diagram_guide` | Best-practice color palettes, sizing, layout, anti-patterns |

---

## Key Design Decisions

### 1. Two rendering modes
- **Streaming mode** (`create_view`) — official MCP's inline rendering with animations. Best for generating a complete diagram from a prompt. Stateless.
- **Canvas mode** (all other tools) — persistent live canvas with element-level control. Best for iterative work, collaboration, and refinement.

Both coexist. The AI picks the right mode for the task.

### 2. Persistent storage
Canvas state is backed by a JSON file on disk (not just in-memory like yctimlin's). Survives server restarts. File location configurable via `CANVAS_STORE_PATH`.

### 3. WebSocket sync
Canvas server pushes element updates to all connected clients (browser + MCP server) via WebSocket. Changes from the browser (human editing) are visible to the AI, and vice versa.

### 4. No auth
Export to Excalidraw+ via shareable URLs. No account integration needed. `.excalidraw` files can be opened directly in Excalidraw+ at any time.

---

## Phases

### Phase 1 — Foundation (MVP)
- [ ] Fork `excalidraw/excalidraw-mcp` to `achen2089/excalidraw-mcp-enhanced`
- [ ] Add Express canvas server with Excalidraw UI + REST API + WebSocket sync
- [ ] Port element CRUD tools (create, get, update, delete, batch create, query, duplicate)
- [ ] Port scene awareness tools (describe_scene, get_canvas_screenshot)
- [ ] File-backed persistent storage
- [ ] Docker setup for Mac mini

### Phase 2 — Full Toolkit
- [ ] Port layout tools (align, distribute, group, ungroup, lock, unlock)
- [ ] Port file I/O tools (export_scene, import_scene, export_to_image, create_from_mermaid)
- [ ] Port state management tools (clear, snapshot, restore)
- [ ] Port viewport control (set_viewport)
- [ ] Port design guide (read_diagram_guide)
- [ ] Unify duplicate tools between official and yctimlin (export URLs, etc.)

### Phase 3 — Polish
- [ ] Ensure streaming `create_view` and canvas mode work seamlessly together (create_view output syncs to persistent canvas)
- [ ] README with setup instructions, tool reference, demo GIFs
- [ ] Test with Claude Desktop, Claude Code, Cursor, Codex

---

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `EXPRESS_SERVER_URL` | Canvas server URL | `http://localhost:3000` |
| `ENABLE_CANVAS_SYNC` | Enable real-time WebSocket sync | `true` |
| `CANVAS_STORE_PATH` | Path to persistent JSON store | `./canvas-state.json` |
| `HOST` | Canvas server bind address | `0.0.0.0` |
| `PORT` | Canvas server port | `3000` |

---

## Success Criteria

1. AI agent can draw a diagram on a live canvas that Anthony sees in real-time in a browser tab
2. Anthony can edit the diagram in the browser, and the AI can see/respond to those edits
3. Diagrams persist across server restarts
4. Can export any diagram as a shareable Excalidraw URL or `.excalidraw` file
5. Streaming `create_view` animations still work for one-shot diagram generation
6. All 26 tools from yctimlin's project work correctly
7. Runs reliably on Mac mini via Docker
