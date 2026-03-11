/**
 * Canvas Server — Express + WebSocket server for Excalidraw.
 * Serves UI, REST API for element CRUD, WebSocket for real-time sync.
 * Persistent file-backed storage.
 */
import express from "express";
import cors from "cors";
import { createServer } from "http";
import { WebSocketServer, WebSocket } from "ws";
import path from "node:path";
import fs from "node:fs";
import { CanvasStorage } from "./storage.js";
import {
  generateId,
  normalizeFontFamily,
  type ServerElement,
  type ExcalidrawFile,
  type WebSocketMessage,
} from "./types.js";

const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ server });

const storage = new CanvasStorage();
const clients = new Set<WebSocket>();

function broadcast(message: WebSocketMessage): void {
  const data = JSON.stringify(message);
  for (const client of clients) {
    if (client.readyState === WebSocket.OPEN) {
      try { client.send(data); } catch { clients.delete(client); }
    }
  }
}

// Middleware
app.use(cors());
app.use(express.json({ limit: "10mb" }));

// Serve static frontend
const distDir = path.join(import.meta.dirname || path.dirname(new URL(import.meta.url).pathname), "../../dist/canvas-ui");
app.use(express.static(distDir));

// ─── WebSocket ───
wss.on("connection", (ws) => {
  clients.add(ws);
  // Send current state
  const files = storage.getFiles();
  ws.send(JSON.stringify({
    type: "initial_elements",
    elements: storage.getElements(),
    ...(Object.keys(files).length > 0 ? { files } : {}),
  }));
  ws.on("close", () => clients.delete(ws));
  ws.on("error", () => clients.delete(ws));
});

// ─── REST API ───

// Health
app.get("/health", (_req, res) => {
  res.json({
    status: "healthy",
    timestamp: new Date().toISOString(),
    elements_count: storage.elementCount,
    websocket_clients: clients.size,
  });
});

// Get all elements
app.get("/api/elements", (_req, res) => {
  const elements = storage.getElements();
  res.json({ success: true, elements, count: elements.length });
});

// Search/query elements
app.get("/api/elements/search", (req, res) => {
  const { type, ...filters } = req.query;
  let results = storage.getElements();
  if (type && typeof type === "string") {
    results = results.filter((el) => el.type === type);
  }
  for (const [key, value] of Object.entries(filters)) {
    results = results.filter((el) => String((el as any)[key]) === String(value));
  }
  res.json({ success: true, elements: results, count: results.length });
});

// Get element by ID
app.get("/api/elements/:id", (req, res) => {
  const el = storage.getElement(req.params.id);
  if (!el) return res.status(404).json({ success: false, error: `Element ${req.params.id} not found` });
  res.json({ success: true, element: el });
});

// Create element
app.post("/api/elements", (req, res) => {
  try {
    const id = req.body.id || generateId();
    const element: ServerElement = {
      ...req.body,
      id,
      fontFamily: normalizeFontFamily(req.body.fontFamily),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      version: 1,
    };
    storage.setElement(element);
    broadcast({ type: "element_created", element });
    res.json({ success: true, element });
  } catch (error) {
    res.status(400).json({ success: false, error: (error as Error).message });
  }
});

// Batch create
app.post("/api/elements/batch", (req, res) => {
  try {
    const items = req.body.elements;
    if (!Array.isArray(items)) return res.status(400).json({ success: false, error: "Expected elements array" });

    const created: ServerElement[] = [];
    for (const item of items) {
      const id = item.id || generateId();
      const element: ServerElement = {
        ...item,
        id,
        fontFamily: normalizeFontFamily(item.fontFamily),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        version: 1,
      };
      storage.setElement(element);
      created.push(element);
    }
    broadcast({ type: "elements_batch_created", elements: created });
    res.json({ success: true, elements: created, count: created.length });
  } catch (error) {
    res.status(400).json({ success: false, error: (error as Error).message });
  }
});

// Update element
app.put("/api/elements/:id", (req, res) => {
  const { id } = req.params;
  const existing = storage.getElement(id);
  if (!existing) return res.status(404).json({ success: false, error: `Element ${id} not found` });

  const updated: ServerElement = {
    ...existing,
    ...req.body,
    id, // ensure ID doesn't change
    fontFamily: req.body.fontFamily !== undefined ? normalizeFontFamily(req.body.fontFamily) : existing.fontFamily,
    updatedAt: new Date().toISOString(),
    version: (existing.version || 0) + 1,
  };
  storage.setElement(updated);
  broadcast({ type: "element_updated", element: updated });
  res.json({ success: true, element: updated });
});

// Clear all (must be before /:id route)
app.delete("/api/elements/clear", (_req, res) => {
  const count = storage.clearElements();
  broadcast({ type: "canvas_cleared", timestamp: new Date().toISOString() });
  res.json({ success: true, message: `Cleared ${count} elements`, count });
});

// Delete element
app.delete("/api/elements/:id", (req, res) => {
  const { id } = req.params;
  if (!storage.deleteElement(id)) {
    return res.status(404).json({ success: false, error: `Element ${id} not found` });
  }
  broadcast({ type: "element_deleted", elementId: id });
  res.json({ success: true, message: `Element ${id} deleted` });
});

// Convert Mermaid diagram to Excalidraw elements (via frontend)
app.post("/api/elements/from-mermaid", (req, res) => {
  try {
    const { mermaidDiagram, config } = req.body;
    if (!mermaidDiagram || typeof mermaidDiagram !== "string") {
      return res.status(400).json({ success: false, error: "mermaidDiagram string required" });
    }
    if (clients.size === 0) {
      return res.status(503).json({ success: false, error: "No frontend connected" });
    }
    broadcast({ type: "mermaid_convert", mermaidDiagram, config: config || {}, timestamp: new Date().toISOString() });
    res.json({ success: true, mermaidDiagram, config: config || {}, message: "Mermaid diagram sent to frontend for conversion." });
  } catch (error) {
    res.status(400).json({ success: false, error: (error as Error).message });
  }
});

// Sync from frontend (overwrite)
app.post("/api/elements/sync", (req, res) => {
  const { elements: frontendElements } = req.body;
  if (!Array.isArray(frontendElements)) return res.status(400).json({ success: false, error: "Expected array" });

  const beforeCount = storage.elementCount;
  storage.clearElements();
  let count = 0;
  for (const el of frontendElements) {
    const id = el.id || generateId();
    storage.setElement({ ...el, id, version: 1 });
    count++;
  }
  broadcast({ type: "elements_synced", count, timestamp: new Date().toISOString() });
  res.json({ success: true, message: `Synced ${count} elements`, count, beforeCount, afterCount: storage.elementCount });
});

// ─── Files API ───
app.get("/api/files", (_req, res) => res.json({ files: storage.getFiles() }));

app.post("/api/files", (req, res) => {
  const fileList: ExcalidrawFile[] = Array.isArray(req.body) ? req.body : (req.body?.files || []);
  for (const f of fileList) {
    if (f.id && f.dataURL) storage.setFile({ id: f.id, dataURL: f.dataURL, mimeType: f.mimeType || "image/png", created: f.created || Date.now() });
  }
  broadcast({ type: "files_added", files: fileList });
  res.json({ success: true, count: fileList.length });
});

app.delete("/api/files/:id", (req, res) => {
  if (storage.deleteFile(req.params.id)) {
    broadcast({ type: "file_deleted", fileId: req.params.id });
    res.json({ success: true });
  } else {
    res.status(404).json({ success: false, error: "File not found" });
  }
});

// ─── Image export (browser-based via WS) ───
interface PendingExport {
  resolve: (data: { format: string; data: string }) => void;
  reject: (error: Error) => void;
  timeout: ReturnType<typeof setTimeout>;
  bestResult: { format: string; data: string } | null;
  collectionTimeout: ReturnType<typeof setTimeout> | null;
}
const pendingExports = new Map<string, PendingExport>();

app.post("/api/export/image", (req, res) => {
  const { format, background } = req.body;
  if (!format || !["png", "svg"].includes(format)) return res.status(400).json({ success: false, error: 'format must be "png" or "svg"' });
  if (clients.size === 0) return res.status(503).json({ success: false, error: "No frontend connected" });

  const requestId = generateId();
  const exportPromise = new Promise<{ format: string; data: string }>((resolve, reject) => {
    const timeout = setTimeout(() => {
      const p = pendingExports.get(requestId);
      pendingExports.delete(requestId);
      if (p?.bestResult) resolve(p.bestResult);
      else reject(new Error("Export timed out"));
    }, 30000);
    pendingExports.set(requestId, { resolve, reject, timeout, bestResult: null, collectionTimeout: null });
  });

  // Send current state + export request
  const files = storage.getFiles();
  broadcast({ type: "initial_elements", elements: storage.getElements(), ...(Object.keys(files).length > 0 ? { files } : {}) });
  setTimeout(() => {
    broadcast({ type: "export_image_request", requestId, format, background: background ?? true });
  }, 800);

  exportPromise
    .then((result) => res.json({ success: true, format: result.format, data: result.data }))
    .catch((error) => res.status(500).json({ success: false, error: (error as Error).message }));
});

app.post("/api/export/image/result", (req, res) => {
  const { requestId, format, data, error } = req.body;
  if (!requestId) return res.status(400).json({ success: false, error: "requestId required" });
  const pending = pendingExports.get(requestId);
  if (!pending) return res.json({ success: true });
  if (error) return res.json({ success: true }); // wait for other clients

  if (!pending.bestResult || data.length > pending.bestResult.data.length) {
    pending.bestResult = { format, data };
  }
  if (!pending.collectionTimeout) {
    pending.collectionTimeout = setTimeout(() => {
      const p = pendingExports.get(requestId);
      if (p?.bestResult) {
        clearTimeout(p.timeout);
        pendingExports.delete(requestId);
        p.resolve(p.bestResult);
      }
    }, 3000);
  }
  res.json({ success: true });
});

// ─── Snapshots ───
app.get("/api/snapshots", (_req, res) => {
  const list = storage.getSnapshots().map((s) => ({ name: s.name, elementCount: s.elements.length, createdAt: s.createdAt }));
  res.json({ success: true, snapshots: list, count: list.length });
});

app.get("/api/snapshots/:name", (req, res) => {
  const snapshot = storage.getSnapshot(req.params.name);
  if (!snapshot) return res.status(404).json({ success: false, error: `Snapshot "${req.params.name}" not found` });
  res.json({ success: true, snapshot });
});

app.post("/api/snapshots", (req, res) => {
  const { name } = req.body;
  if (!name) return res.status(400).json({ success: false, error: "name required" });
  const snapshot = { name, elements: storage.getElements(), createdAt: new Date().toISOString() };
  storage.setSnapshot(snapshot);
  res.json({ success: true, name, elementCount: snapshot.elements.length, createdAt: snapshot.createdAt });
});

// ─── Viewport ───
interface PendingViewport {
  resolve: (data: any) => void;
  reject: (error: Error) => void;
  timeout: ReturnType<typeof setTimeout>;
}
const pendingViewports = new Map<string, PendingViewport>();

app.post("/api/viewport", (req, res) => {
  if (clients.size === 0) return res.status(503).json({ success: false, error: "No frontend connected" });
  const requestId = generateId();
  const promise = new Promise<any>((resolve, reject) => {
    const timeout = setTimeout(() => { pendingViewports.delete(requestId); reject(new Error("Viewport timeout")); }, 10000);
    pendingViewports.set(requestId, { resolve, reject, timeout });
  });
  broadcast({ type: "set_viewport", requestId, ...req.body });
  promise.then((r) => res.json(r)).catch((e) => res.status(500).json({ success: false, error: e.message }));
});

app.post("/api/viewport/result", (req, res) => {
  const { requestId, error, message } = req.body;
  const pending = pendingViewports.get(requestId);
  if (!pending) return res.json({ success: true });
  clearTimeout(pending.timeout);
  pendingViewports.delete(requestId);
  pending.resolve(error ? { success: false, message: error } : { success: true, message: message || "Viewport updated" });
  res.json({ success: true });
});

// Serve frontend for all other routes
app.get("/{*path}", (_req, res) => {
  const indexPath = path.join(distDir, "index.html");
  if (fs.existsSync(indexPath)) {
    res.sendFile(indexPath);
  } else {
    res.status(200).send(`
      <!DOCTYPE html>
      <html><head><title>Excalidraw Canvas</title></head>
      <body style="margin:0;display:flex;align-items:center;justify-content:center;height:100vh;font-family:sans-serif">
        <div style="text-align:center">
          <h1>🎨 Excalidraw Canvas Server</h1>
          <p>Canvas server is running. Build the frontend with <code>npm run build:canvas-ui</code></p>
          <p>API: <a href="/health">/health</a> | <a href="/api/elements">/api/elements</a></p>
        </div>
      </body></html>
    `);
  }
});

// ─── Start ───
const PORT = parseInt(process.env.PORT || "3000", 10);
const HOST = process.env.HOST || "0.0.0.0";

server.listen(PORT, HOST, () => {
  console.log(`Canvas server running on http://${HOST}:${PORT}`);
  console.log(`WebSocket server running on ws://${HOST}:${PORT}`);
  console.log(`Storage: ${process.env.CANVAS_STORE_PATH || "./canvas-state.json"}`);
});

// Graceful shutdown
process.on("SIGINT", () => { storage.flush(); process.exit(0); });
process.on("SIGTERM", () => { storage.flush(); process.exit(0); });

export default app;
