import React, { useState, useEffect, useRef, useCallback } from "react";
import "@excalidraw/excalidraw/index.css";
import {
  Excalidraw,
  convertToExcalidrawElements,
  exportToBlob,
  exportToSvg,
} from "@excalidraw/excalidraw";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types/types";
import type { ExcalidrawElement } from "@excalidraw/excalidraw/types/element/types";

const AUTO_SYNC_MS = 1200;

interface ServerElement {
  id: string;
  type: string;
  [key: string]: any;
}

function cleanElement(el: ServerElement): Partial<ExcalidrawElement> {
  const { createdAt, updatedAt, version, syncedAt, source, syncTimestamp, ...clean } = el;
  return clean;
}

export default function App() {
  const [api, setApi] = useState<ExcalidrawImperativeAPI | null>(null);
  const apiRef = useRef<ExcalidrawImperativeAPI | null>(null);
  const [connected, setConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const syncTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const suppressSync = useRef(0);
  const userInteracted = useRef(false);
  const syncInFlight = useRef(false);

  useEffect(() => { apiRef.current = api; }, [api]);

  const applyScene = useCallback((scene: Parameters<ExcalidrawImperativeAPI["updateScene"]>[0]) => {
    const a = apiRef.current;
    if (!a) return;
    suppressSync.current++;
    a.updateScene(scene);
    setTimeout(() => { suppressSync.current = Math.max(0, suppressSync.current - 1); }, 0);
  }, []);

  const syncToBackend = useCallback(async () => {
    const a = apiRef.current;
    if (!a || syncInFlight.current) return;
    syncInFlight.current = true;
    try {
      const els = a.getSceneElements().filter((e) => !e.isDeleted);
      await fetch("/api/elements/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ elements: els, timestamp: new Date().toISOString() }),
      });
    } catch (e) {
      console.error("Sync error:", e);
    } finally {
      syncInFlight.current = false;
    }
  }, []);

  const scheduleSync = useCallback(() => {
    if (!connected || !apiRef.current || !userInteracted.current || suppressSync.current > 0) return;
    if (syncTimer.current) clearTimeout(syncTimer.current);
    syncTimer.current = setTimeout(() => {
      syncTimer.current = null;
      if (suppressSync.current > 0 || syncInFlight.current) return;
      syncToBackend();
    }, AUTO_SYNC_MS);
  }, [connected, syncToBackend]);

  // WebSocket
  useEffect(() => {
    const connect = () => {
      const proto = location.protocol === "https:" ? "wss:" : "ws:";
      const ws = new WebSocket(`${proto}//${location.host}`);
      wsRef.current = ws;

      ws.onopen = () => setConnected(true);
      ws.onclose = (e) => { setConnected(false); if (e.code !== 1000) setTimeout(connect, 3000); };
      ws.onerror = () => setConnected(false);

      ws.onmessage = (event) => {
        const data = JSON.parse(event.data);
        const a = apiRef.current;
        if (!a) return;
        const current = a.getSceneElements();

        const mergeIncoming = (incoming: Partial<ExcalidrawElement>[]) => {
          if (!incoming.length) return;
          const byId = new Map(incoming.map((e) => [e.id!, e]));
          const merged = current.map((e) => {
            const inc = byId.get(e.id);
            if (inc) { byId.delete(e.id); return { ...e, ...inc }; }
            return e;
          });
          merged.push(...byId.values());
          const converted = convertToExcalidrawElements(merged as any, { regenerateIds: false });
          applyScene({ elements: converted });
        };

        switch (data.type) {
          case "initial_elements":
            if (data.elements?.length) {
              const cleaned = data.elements.map(cleanElement);
              const converted = convertToExcalidrawElements(cleaned as any, { regenerateIds: false });
              applyScene({ elements: converted });
            }
            if (data.files) a.addFiles(Object.values(data.files));
            break;
          case "element_created":
            if (data.element) mergeIncoming([cleanElement(data.element)]);
            break;
          case "element_updated":
            if (data.element) mergeIncoming([cleanElement(data.element)]);
            break;
          case "element_deleted":
            if (data.elementId) applyScene({ elements: current.filter((e) => e.id !== data.elementId) });
            break;
          case "elements_batch_created":
            if (data.elements) mergeIncoming(data.elements.map(cleanElement));
            break;
          case "canvas_cleared":
            applyScene({ elements: [] });
            break;
          case "files_added":
            if (Array.isArray(data.files)) a.addFiles(data.files);
            break;
          case "export_image_request":
            handleExport(data, a);
            break;
          case "set_viewport":
            handleViewport(data, a);
            break;
          case "mermaid_convert":
            handleMermaid(data, a);
            break;
        }
      };
    };
    connect();
    return () => { wsRef.current?.close(); };
  }, [applyScene]);

  async function handleExport(data: any, a: ExcalidrawImperativeAPI) {
    try {
      const elements = a.getSceneElements();
      const appState = a.getAppState();
      const files = a.getFiles();
      if (data.format === "svg") {
        const svg = await exportToSvg({ elements, appState: { ...appState, exportBackground: data.background !== false }, files });
        const svgStr = new XMLSerializer().serializeToString(svg);
        await fetch("/api/export/image/result", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ requestId: data.requestId, format: "svg", data: svgStr }),
        });
      } else {
        const blob = await exportToBlob({ elements, appState: { ...appState, exportBackground: data.background !== false }, files, mimeType: "image/png" });
        const reader = new FileReader();
        reader.onload = async () => {
          const base64 = (reader.result as string)?.split(",")[1];
          await fetch("/api/export/image/result", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ requestId: data.requestId, format: "png", data: base64 }),
          });
        };
        reader.readAsDataURL(blob);
      }
    } catch (e) {
      await fetch("/api/export/image/result", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requestId: data.requestId, error: (e as Error).message }),
      });
    }
  }

  async function handleViewport(data: any, a: ExcalidrawImperativeAPI) {
    try {
      if (data.scrollToContent) {
        const els = a.getSceneElements();
        if (els.length) a.scrollToContent(els, { fitToViewport: true, animate: true });
      } else if (data.scrollToElementId) {
        const el = a.getSceneElements().find((e) => e.id === data.scrollToElementId);
        if (el) a.scrollToContent([el], { fitToViewport: false, animate: true });
        else throw new Error(`Element ${data.scrollToElementId} not found`);
      } else {
        const appState: any = {};
        if (data.zoom !== undefined) appState.zoom = { value: data.zoom };
        if (data.offsetX !== undefined) appState.scrollX = data.offsetX;
        if (data.offsetY !== undefined) appState.scrollY = data.offsetY;
        if (Object.keys(appState).length) applyScene({ appState });
      }
      await fetch("/api/viewport/result", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requestId: data.requestId, success: true, message: "Viewport updated" }),
      });
    } catch (e) {
      await fetch("/api/viewport/result", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requestId: data.requestId, error: (e as Error).message }),
      });
    }
  }

  async function handleMermaid(data: any, a: ExcalidrawImperativeAPI) {
    try {
      const mermaidLib = await import("@excalidraw/mermaid-to-excalidraw");
      const { elements: mermaidElements, files } = await mermaidLib.parseMermaidToExcalidraw(data.mermaidDiagram, { fontSize: 16 });
      if (mermaidElements && mermaidElements.length > 0) {
        const converted = convertToExcalidrawElements(mermaidElements as any, { regenerateIds: false });
        const current = a.getSceneElements();
        applyScene({ elements: [...current, ...converted] });
        if (files) a.addFiles(Object.values(files) as any);
        setTimeout(async () => {
          const els = a.getSceneElements().filter((e) => !e.isDeleted);
          await fetch("/api/elements/sync", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ elements: els }),
          });
        }, 500);
      }
    } catch (e) {
      console.error("Mermaid conversion failed:", e);
    }
  }

  const [elementCount, setElementCount] = useState(0);

  // Track element count on changes
  useEffect(() => {
    if (!api) return;
    const interval = setInterval(() => {
      const count = api.getSceneElements().filter((e) => !e.isDeleted).length;
      setElementCount(count);
    }, 1000);
    return () => clearInterval(interval);
  }, [api]);

  return (
    <div style={{ width: "100%", height: "100vh", display: "flex", flexDirection: "column" }}>
      <div className="header">
        <div className="header-left">
          <span className="header-logo">✏️</span>
          <span className="header-title">Excalidraw MCP Enhanced</span>
          <span className="header-badge">CANVAS</span>
        </div>
        <div className="header-right">
          <span className="element-count">{elementCount} element{elementCount !== 1 ? "s" : ""}</span>
          <div className="status-pill">
            <div className={`status-dot ${connected ? "status-connected" : "status-disconnected"}`} />
            <span>{connected ? "Live" : "Offline"}</span>
          </div>
          <button className="btn" onClick={syncToBackend}>Sync</button>
          <button className="btn btn-danger" onClick={() => { if (apiRef.current) applyScene({ elements: [] }); fetch("/api/elements/clear", { method: "DELETE" }); }}>
            Clear
          </button>
        </div>
      </div>
      <div className="canvas-container"
        onPointerDownCapture={() => { userInteracted.current = true; }}
        onKeyDownCapture={() => { userInteracted.current = true; }}>
        <Excalidraw
          excalidrawAPI={(a: ExcalidrawImperativeAPI) => setApi(a)}
          onChange={() => scheduleSync()}
          initialData={{ elements: [], appState: { theme: "light", viewBackgroundColor: "#ffffff" } }}
        />
      </div>
    </div>
  );
}
