/**
 * Canvas CRUD tools for the MCP server.
 * These tools communicate with the canvas server via HTTP.
 */
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod/v4";

const EXPRESS_SERVER_URL = process.env.EXPRESS_SERVER_URL || "http://localhost:3000";

// ─── HTTP helpers ───

interface ApiResult {
  success?: boolean;
  error?: string;
  element?: any;
  elements?: any[];
  count?: number;
  data?: string;
  format?: string;
  [key: string]: any;
}

async function canvasGet(path: string): Promise<ApiResult> {
  const res = await fetch(`${EXPRESS_SERVER_URL}${path}`);
  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as ApiResult;
    throw new Error(body.error || `Canvas server error: ${res.status}`);
  }
  return res.json() as Promise<ApiResult>;
}

async function canvasPost(path: string, body: any): Promise<ApiResult> {
  const res = await fetch(`${EXPRESS_SERVER_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({})) as ApiResult;
    throw new Error(data.error || `Canvas server error: ${res.status}`);
  }
  return res.json() as Promise<ApiResult>;
}

async function canvasPut(path: string, body: any): Promise<ApiResult> {
  const res = await fetch(`${EXPRESS_SERVER_URL}${path}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({})) as ApiResult;
    throw new Error(data.error || `Canvas server error: ${res.status}`);
  }
  return res.json() as Promise<ApiResult>;
}

async function canvasDelete(path: string): Promise<ApiResult> {
  const res = await fetch(`${EXPRESS_SERVER_URL}${path}`, { method: "DELETE" });
  if (!res.ok) {
    const data = await res.json().catch(() => ({})) as ApiResult;
    throw new Error(data.error || `Canvas server error: ${res.status}`);
  }
  return res.json() as Promise<ApiResult>;
}

function ok(text: string): CallToolResult {
  return { content: [{ type: "text", text }] };
}

function err(text: string): CallToolResult {
  return { content: [{ type: "text", text }], isError: true };
}

// ─── Element schemas ───

const ElementType = z.enum(["rectangle", "ellipse", "diamond", "arrow", "text", "line", "freedraw", "image"]);

const BaseElementProps = {
  id: z.string().optional().describe("Custom element ID (auto-generated if omitted)"),
  type: ElementType,
  x: z.number(),
  y: z.number(),
  width: z.number().optional(),
  height: z.number().optional(),
  backgroundColor: z.string().optional(),
  strokeColor: z.string().optional(),
  strokeWidth: z.number().optional(),
  strokeStyle: z.string().optional().describe("solid, dashed, or dotted"),
  roughness: z.number().optional(),
  opacity: z.number().optional(),
  text: z.string().optional().describe("Text content (for text elements) or label text (for shapes)"),
  fontSize: z.number().optional(),
  fontFamily: z.union([z.string(), z.number()]).optional().describe("Font: virgil(1), helvetica(2), cascadia(3)"),
  roundness: z.object({ type: z.number(), value: z.number().optional() }).nullable().optional(),
  fillStyle: z.string().optional(),
  locked: z.boolean().optional(),
  groupIds: z.array(z.string()).optional(),
  // Arrow
  points: z.any().optional(),
  startBinding: z.any().optional(),
  endBinding: z.any().optional(),
  startArrowhead: z.string().nullable().optional(),
  endArrowhead: z.string().nullable().optional(),
  elbowed: z.boolean().optional(),
  // Label
  label: z.object({ text: z.string() }).optional(),
};

/**
 * Registers all canvas CRUD + scene tools on the MCP server.
 */
export function registerCanvasTools(server: McpServer): void {

  // ─── create_element ───
  server.registerTool(
    "create_element",
    {
      description: "Create a new element on the persistent canvas. For shapes, use label.text for auto-centered text. For arrows, use startBinding/endBinding with elementId and fixedPoint.",
      inputSchema: z.object(BaseElementProps),
    },
    async (args): Promise<CallToolResult> => {
      try {
        // Convert text to label for non-text elements
        const body: any = { ...args };
        if (body.text && body.type !== "text" && !body.label) {
          body.label = { text: body.text };
          delete body.text;
        }
        const data = await canvasPost("/api/elements", body);
        return ok(`Element created: ${JSON.stringify(data.element, null, 2)}`);
      } catch (e) {
        return err(`Failed to create element: ${(e as Error).message}`);
      }
    },
  );

  // ─── batch_create_elements ───
  server.registerTool(
    "batch_create_elements",
    {
      description: "Create multiple elements on the canvas at once. Assign custom IDs to shapes so arrows can reference them via startBinding/endBinding.",
      inputSchema: z.object({
        elements: z.array(z.object(BaseElementProps)),
      }),
    },
    async ({ elements }): Promise<CallToolResult> => {
      try {
        // Convert text to label for non-text elements
        const processed = elements.map((el: any) => {
          if (el.text && el.type !== "text" && !el.label) {
            return { ...el, label: { text: el.text }, text: undefined };
          }
          return el;
        });
        const data = await canvasPost("/api/elements/batch", { elements: processed });
        return ok(`Created ${data.count} elements:\n${JSON.stringify(data.elements, null, 2)}`);
      } catch (e) {
        return err(`Failed to batch create: ${(e as Error).message}`);
      }
    },
  );

  // ─── get_element ───
  server.registerTool(
    "get_element",
    {
      description: "Get a single element from the canvas by ID.",
      inputSchema: z.object({ id: z.string() }),
      annotations: { readOnlyHint: true },
    },
    async ({ id }): Promise<CallToolResult> => {
      try {
        const data = await canvasGet(`/api/elements/${id}`);
        return ok(JSON.stringify(data.element, null, 2));
      } catch (e) {
        return err(`Element not found: ${(e as Error).message}`);
      }
    },
  );

  // ─── query_elements ───
  server.registerTool(
    "query_elements",
    {
      description: "Query elements on the canvas. Filter by type and/or property values.",
      inputSchema: z.object({
        type: ElementType.optional(),
        filter: z.record(z.string(), z.any()).optional(),
      }),
      annotations: { readOnlyHint: true },
    },
    async ({ type, filter }): Promise<CallToolResult> => {
      try {
        const params = new URLSearchParams();
        if (type) params.set("type", type);
        if (filter) {
          for (const [k, v] of Object.entries(filter)) params.set(k, String(v));
        }
        const data = await canvasGet(`/api/elements/search?${params}`);
        return ok(`Found ${data.count} elements:\n${JSON.stringify(data.elements, null, 2)}`);
      } catch (e) {
        return err(`Query failed: ${(e as Error).message}`);
      }
    },
  );

  // ─── update_element ───
  server.registerTool(
    "update_element",
    {
      description: "Update properties of an existing element on the canvas.",
      inputSchema: z.object({
        id: z.string(),
        x: z.number().optional(),
        y: z.number().optional(),
        width: z.number().optional(),
        height: z.number().optional(),
        backgroundColor: z.string().optional(),
        strokeColor: z.string().optional(),
        strokeWidth: z.number().optional(),
        strokeStyle: z.string().optional(),
        roughness: z.number().optional(),
        opacity: z.number().optional(),
        text: z.string().optional(),
        fontSize: z.number().optional(),
        fontFamily: z.union([z.string(), z.number()]).optional(),
        roundness: z.object({ type: z.number(), value: z.number().optional() }).nullable().optional(),
        fillStyle: z.string().optional(),
        locked: z.boolean().optional(),
        label: z.object({ text: z.string() }).optional(),
      }),
    },
    async ({ id, ...updates }): Promise<CallToolResult> => {
      try {
        const data = await canvasPut(`/api/elements/${id}`, updates);
        return ok(`Element updated: ${JSON.stringify(data.element, null, 2)}`);
      } catch (e) {
        return err(`Failed to update: ${(e as Error).message}`);
      }
    },
  );

  // ─── delete_element ───
  server.registerTool(
    "delete_element",
    {
      description: "Delete an element from the canvas by ID.",
      inputSchema: z.object({ id: z.string() }),
    },
    async ({ id }): Promise<CallToolResult> => {
      try {
        await canvasDelete(`/api/elements/${id}`);
        return ok(`Element ${id} deleted.`);
      } catch (e) {
        return err(`Failed to delete: ${(e as Error).message}`);
      }
    },
  );

  // ─── duplicate_elements ───
  server.registerTool(
    "duplicate_elements",
    {
      description: "Duplicate elements on the canvas with an offset.",
      inputSchema: z.object({
        elementIds: z.array(z.string()),
        offsetX: z.number().optional().describe("Horizontal offset (default: 20)"),
        offsetY: z.number().optional().describe("Vertical offset (default: 20)"),
      }),
    },
    async ({ elementIds, offsetX = 20, offsetY = 20 }): Promise<CallToolResult> => {
      try {
        const duplicates: any[] = [];
        for (const id of elementIds) {
          const data = await canvasGet(`/api/elements/${id}`);
          const original = data.element;
          const { createdAt, updatedAt, version, id: _id, ...rest } = original;
          duplicates.push({ ...rest, x: original.x + offsetX, y: original.y + offsetY });
        }
        if (duplicates.length === 0) return err("No elements found to duplicate");
        const result = await canvasPost("/api/elements/batch", { elements: duplicates });
        return ok(`Duplicated ${result.count} elements:\n${JSON.stringify(result.elements, null, 2)}`);
      } catch (e) {
        return err(`Failed to duplicate: ${(e as Error).message}`);
      }
    },
  );

  // ─── describe_scene ───
  server.registerTool(
    "describe_scene",
    {
      description: "Get an AI-readable description of everything on the canvas: element types, positions, connections, labels, bounding box. Use this to understand the current state before making changes.",
      annotations: { readOnlyHint: true },
    },
    async (): Promise<CallToolResult> => {
      try {
        const data = await canvasGet("/api/elements");
        const elements = data.elements || [];

        if (elements.length === 0) return ok("The canvas is empty.");

        // Type counts
        const typeCounts: Record<string, number> = {};
        for (const el of elements) typeCounts[el.type] = (typeCounts[el.type] || 0) + 1;

        // Bounding box
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        for (const el of elements) {
          minX = Math.min(minX, el.x);
          minY = Math.min(minY, el.y);
          maxX = Math.max(maxX, el.x + (el.width || 0));
          maxY = Math.max(maxY, el.y + (el.height || 0));
        }

        // Sort top-to-bottom, left-to-right
        const sorted = [...elements].sort((a: any, b: any) => {
          const rowDiff = Math.floor(a.y / 50) - Math.floor(b.y / 50);
          return rowDiff !== 0 ? rowDiff : a.x - b.x;
        });

        const lines: string[] = [];
        lines.push("## Canvas Description");
        lines.push(`Total: ${elements.length} elements`);
        lines.push(`Types: ${Object.entries(typeCounts).map(([t, c]) => `${t}(${c})`).join(", ")}`);
        lines.push(`Bounds: (${Math.round(minX)},${Math.round(minY)}) to (${Math.round(maxX)},${Math.round(maxY)}) = ${Math.round(maxX - minX)}×${Math.round(maxY - minY)}`);
        lines.push("");
        lines.push("### Elements:");

        for (const el of sorted) {
          const parts: string[] = [`[${el.id}] ${el.type} at (${Math.round(el.x)},${Math.round(el.y)})`];
          if (el.width || el.height) parts.push(`${Math.round(el.width || 0)}×${Math.round(el.height || 0)}`);
          if (el.text) parts.push(`"${el.text}"`);
          if (el.label?.text) parts.push(`label:"${el.label.text}"`);
          if (el.backgroundColor && el.backgroundColor !== "transparent") parts.push(`bg:${el.backgroundColor}`);
          if (el.locked) parts.push("(locked)");
          lines.push(`  ${parts.join(" | ")}`);
        }

        // Connections
        const arrows = elements.filter((e: any) => e.type === "arrow");
        if (arrows.length > 0) {
          const conns = arrows.filter((a: any) => a.startBinding?.elementId || a.endBinding?.elementId);
          if (conns.length > 0) {
            lines.push("");
            lines.push("### Connections:");
            for (const a of conns) {
              lines.push(`  ${a.startBinding?.elementId || "?"} → ${a.endBinding?.elementId || "?"} (${a.id})`);
            }
          }
        }

        return ok(lines.join("\n"));
      } catch (e) {
        return err(`Failed to describe scene: ${(e as Error).message}`);
      }
    },
  );

  // ─── get_canvas_screenshot ───
  server.registerTool(
    "get_canvas_screenshot",
    {
      description: "Take a screenshot of the current canvas. Returns a PNG image. Requires the canvas frontend to be open in a browser.",
      inputSchema: z.object({
        background: z.boolean().optional().describe("Include background (default: true)"),
      }),
      annotations: { readOnlyHint: true },
    },
    async ({ background }): Promise<CallToolResult> => {
      try {
        const result = await canvasPost("/api/export/image", {
          format: "png",
          background: background ?? true,
        });
        return {
          content: [
            { type: "image" as const, data: result.data!, mimeType: "image/png" },
            { type: "text", text: "Canvas screenshot captured." },
          ],
        };
      } catch (e) {
        return err(`Screenshot failed: ${(e as Error).message}`);
      }
    },
  );

  // ═══════════════════════════════════════════════════════════════
  // Phase 2 Tools
  // ═══════════════════════════════════════════════════════════════

  // ─── align_elements ───
  server.registerTool(
    "align_elements",
    {
      description: "Align elements to a specific position (left, center, right, top, middle, bottom). Need at least 2 elements.",
      inputSchema: z.object({
        elementIds: z.array(z.string()),
        alignment: z.enum(["left", "center", "right", "top", "middle", "bottom"]),
      }),
    },
    async ({ elementIds, alignment }): Promise<CallToolResult> => {
      try {
        const elements: any[] = [];
        for (const id of elementIds) {
          const data = await canvasGet(`/api/elements/${id}`);
          if (data.element) elements.push(data.element);
        }
        if (elements.length < 2) return err("Need at least 2 elements to align");

        let updateFn: (el: any) => Record<string, number>;
        switch (alignment) {
          case "left": {
            const minX = Math.min(...elements.map((e) => e.x));
            updateFn = () => ({ x: minX });
            break;
          }
          case "right": {
            const maxR = Math.max(...elements.map((e) => e.x + (e.width || 0)));
            updateFn = (el) => ({ x: maxR - (el.width || 0) });
            break;
          }
          case "center": {
            const centers = elements.map((e) => e.x + (e.width || 0) / 2);
            const avg = centers.reduce((a, b) => a + b, 0) / centers.length;
            updateFn = (el) => ({ x: avg - (el.width || 0) / 2 });
            break;
          }
          case "top": {
            const minY = Math.min(...elements.map((e) => e.y));
            updateFn = () => ({ y: minY });
            break;
          }
          case "bottom": {
            const maxB = Math.max(...elements.map((e) => e.y + (e.height || 0)));
            updateFn = (el) => ({ y: maxB - (el.height || 0) });
            break;
          }
          case "middle": {
            const middles = elements.map((e) => e.y + (e.height || 0) / 2);
            const avgM = middles.reduce((a, b) => a + b, 0) / middles.length;
            updateFn = (el) => ({ y: avgM - (el.height || 0) / 2 });
            break;
          }
        }

        let count = 0;
        for (const el of elements) {
          const coords = updateFn(el);
          await canvasPut(`/api/elements/${el.id}`, coords);
          count++;
        }
        return ok(`Aligned ${count} elements (${alignment})`);
      } catch (e) {
        return err(`Align failed: ${(e as Error).message}`);
      }
    },
  );

  // ─── distribute_elements ───
  server.registerTool(
    "distribute_elements",
    {
      description: "Distribute elements evenly horizontally or vertically. Need at least 3 elements.",
      inputSchema: z.object({
        elementIds: z.array(z.string()),
        direction: z.enum(["horizontal", "vertical"]),
      }),
    },
    async ({ elementIds, direction }): Promise<CallToolResult> => {
      try {
        const elements: any[] = [];
        for (const id of elementIds) {
          const data = await canvasGet(`/api/elements/${id}`);
          if (data.element) elements.push(data.element);
        }
        if (elements.length < 3) return err("Need at least 3 elements to distribute");

        if (direction === "horizontal") {
          elements.sort((a, b) => a.x - b.x);
          const first = elements[0], last = elements[elements.length - 1];
          const totalSpan = (last.x + (last.width || 0)) - first.x;
          const totalW = elements.reduce((s, e) => s + (e.width || 0), 0);
          const gap = (totalSpan - totalW) / (elements.length - 1);
          let cx = first.x;
          for (const el of elements) {
            await canvasPut(`/api/elements/${el.id}`, { x: cx });
            cx += (el.width || 0) + gap;
          }
        } else {
          elements.sort((a, b) => a.y - b.y);
          const first = elements[0], last = elements[elements.length - 1];
          const totalSpan = (last.y + (last.height || 0)) - first.y;
          const totalH = elements.reduce((s, e) => s + (e.height || 0), 0);
          const gap = (totalSpan - totalH) / (elements.length - 1);
          let cy = first.y;
          for (const el of elements) {
            await canvasPut(`/api/elements/${el.id}`, { y: cy });
            cy += (el.height || 0) + gap;
          }
        }
        return ok(`Distributed ${elements.length} elements (${direction})`);
      } catch (e) {
        return err(`Distribute failed: ${(e as Error).message}`);
      }
    },
  );

  // ─── group_elements ───
  server.registerTool(
    "group_elements",
    {
      description: "Group multiple elements together. Returns the new group ID.",
      inputSchema: z.object({
        elementIds: z.array(z.string()),
      }),
    },
    async ({ elementIds }): Promise<CallToolResult> => {
      try {
        const groupId = Date.now().toString(36) + Math.random().toString(36).substring(2);
        let count = 0;
        for (const id of elementIds) {
          const data = await canvasGet(`/api/elements/${id}`);
          const el = data.element;
          if (!el) continue;
          const existing = el.groupIds || [];
          await canvasPut(`/api/elements/${id}`, { groupIds: [...existing, groupId] });
          count++;
        }
        return ok(`Grouped ${count} elements. Group ID: ${groupId}`);
      } catch (e) {
        return err(`Group failed: ${(e as Error).message}`);
      }
    },
  );

  // ─── ungroup_elements ───
  server.registerTool(
    "ungroup_elements",
    {
      description: "Remove a group ID from all elements that belong to it.",
      inputSchema: z.object({
        groupId: z.string(),
      }),
    },
    async ({ groupId }): Promise<CallToolResult> => {
      try {
        const data = await canvasGet("/api/elements");
        const elements = data.elements || [];
        let count = 0;
        for (const el of elements) {
          if (el.groupIds && el.groupIds.includes(groupId)) {
            await canvasPut(`/api/elements/${el.id}`, {
              groupIds: el.groupIds.filter((g: string) => g !== groupId),
            });
            count++;
          }
        }
        return ok(`Ungrouped ${count} elements from group ${groupId}`);
      } catch (e) {
        return err(`Ungroup failed: ${(e as Error).message}`);
      }
    },
  );

  // ─── lock_elements ───
  server.registerTool(
    "lock_elements",
    {
      description: "Lock elements to prevent modification.",
      inputSchema: z.object({
        elementIds: z.array(z.string()),
      }),
    },
    async ({ elementIds }): Promise<CallToolResult> => {
      try {
        let count = 0;
        for (const id of elementIds) {
          await canvasPut(`/api/elements/${id}`, { locked: true });
          count++;
        }
        return ok(`Locked ${count} elements`);
      } catch (e) {
        return err(`Lock failed: ${(e as Error).message}`);
      }
    },
  );

  // ─── unlock_elements ───
  server.registerTool(
    "unlock_elements",
    {
      description: "Unlock elements to allow modification.",
      inputSchema: z.object({
        elementIds: z.array(z.string()),
      }),
    },
    async ({ elementIds }): Promise<CallToolResult> => {
      try {
        let count = 0;
        for (const id of elementIds) {
          await canvasPut(`/api/elements/${id}`, { locked: false });
          count++;
        }
        return ok(`Unlocked ${count} elements`);
      } catch (e) {
        return err(`Unlock failed: ${(e as Error).message}`);
      }
    },
  );

  // ─── export_scene ───
  server.registerTool(
    "export_scene",
    {
      description: "Export the current canvas to .excalidraw JSON format. Optionally write to a file.",
      inputSchema: z.object({
        filePath: z.string().optional().describe("File path to write .excalidraw JSON"),
      }),
      annotations: { readOnlyHint: true },
    },
    async ({ filePath }): Promise<CallToolResult> => {
      try {
        const data = await canvasGet("/api/elements");
        const elements = data.elements || [];
        let files = {};
        try { files = (await canvasGet("/api/files")).files || {}; } catch {}

        const scene = {
          type: "excalidraw",
          version: 2,
          source: "excalidraw-mcp-enhanced",
          elements,
          appState: { viewBackgroundColor: "#ffffff", gridSize: null },
          ...(Object.keys(files).length > 0 ? { files } : {}),
        };

        const json = JSON.stringify(scene, null, 2);

        if (filePath) {
          const fs = await import("node:fs");
          const path = await import("node:path");
          const resolved = path.resolve(filePath);
          const dir = path.dirname(resolved);
          if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
          fs.writeFileSync(resolved, json, "utf-8");
          return ok(`Scene exported to ${resolved} (${elements.length} elements)`);
        }
        return ok(json);
      } catch (e) {
        return err(`Export failed: ${(e as Error).message}`);
      }
    },
  );

  // ─── import_scene ───
  server.registerTool(
    "import_scene",
    {
      description: "Import elements from .excalidraw JSON file or raw JSON data.",
      inputSchema: z.object({
        filePath: z.string().optional(),
        data: z.string().optional(),
        mode: z.enum(["replace", "merge"]).describe("replace clears canvas first, merge appends"),
      }),
    },
    async ({ filePath, data, mode }): Promise<CallToolResult> => {
      try {
        let sceneData: any;
        if (filePath) {
          const fs = await import("node:fs");
          const path = await import("node:path");
          sceneData = JSON.parse(fs.readFileSync(path.resolve(filePath), "utf-8"));
        } else if (data) {
          sceneData = JSON.parse(data);
        } else {
          return err("Provide filePath or data");
        }

        const importElements = Array.isArray(sceneData) ? sceneData : (sceneData.elements || []);
        if (importElements.length === 0) return err("No elements found in import data");

        if (mode === "replace") {
          await canvasDelete("/api/elements/clear");
        }

        const result = await canvasPost("/api/elements/batch", { elements: importElements });

        // Import files if present
        const importFiles = sceneData.files;
        if (importFiles && typeof importFiles === "object") {
          const fileList = Object.values(importFiles);
          if (fileList.length > 0) {
            try { await canvasPost("/api/files", fileList); } catch {}
          }
        }

        return ok(`Imported ${result.count} elements (mode: ${mode})`);
      } catch (e) {
        return err(`Import failed: ${(e as Error).message}`);
      }
    },
  );

  // ─── export_to_image ───
  server.registerTool(
    "export_to_image",
    {
      description: "Export the canvas to PNG or SVG. Optionally save to file. Requires frontend open in browser.",
      inputSchema: z.object({
        format: z.enum(["png", "svg"]),
        filePath: z.string().optional(),
        background: z.boolean().optional().describe("Include background (default: true)"),
      }),
    },
    async ({ format, filePath, background }): Promise<CallToolResult> => {
      try {
        const result = await canvasPost("/api/export/image", {
          format,
          background: background ?? true,
        });

        if (filePath) {
          const fs = await import("node:fs");
          const path = await import("node:path");
          const resolved = path.resolve(filePath);
          const dir = path.dirname(resolved);
          if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
          if (format === "svg") {
            fs.writeFileSync(resolved, result.data!, "utf-8");
          } else {
            fs.writeFileSync(resolved, Buffer.from(result.data!, "base64"));
          }
          return ok(`Image exported to ${resolved} (format: ${format})`);
        }

        if (format === "png") {
          return {
            content: [
              { type: "image" as const, data: result.data!, mimeType: "image/png" },
              { type: "text", text: `PNG image exported (${result.data!.length} chars base64)` },
            ],
          };
        }
        return ok(result.data!);
      } catch (e) {
        return err(`Image export failed: ${(e as Error).message}`);
      }
    },
  );

  // ─── create_from_mermaid ───
  server.registerTool(
    "create_from_mermaid",
    {
      description: "Convert a Mermaid diagram to Excalidraw elements and render on canvas. Requires frontend open.",
      inputSchema: z.object({
        mermaidDiagram: z.string().describe('Mermaid diagram definition (e.g., "graph TD; A-->B;")'),
        config: z.record(z.string(), z.any()).optional().describe("Optional Mermaid config"),
      }),
    },
    async ({ mermaidDiagram, config }): Promise<CallToolResult> => {
      try {
        const result = await canvasPost("/api/elements/from-mermaid", {
          mermaidDiagram,
          config: config || {},
        });
        return ok(`Mermaid diagram sent for conversion.\n\n${JSON.stringify(result, null, 2)}\n\nOpen the canvas at ${EXPRESS_SERVER_URL} to see the rendered diagram.`);
      } catch (e) {
        return err(`Mermaid conversion failed: ${(e as Error).message}`);
      }
    },
  );

  // ─── clear_canvas ───
  server.registerTool(
    "clear_canvas",
    {
      description: "Remove all elements from the canvas.",
      inputSchema: z.object({}),
    },
    async (): Promise<CallToolResult> => {
      try {
        const result = await canvasDelete("/api/elements/clear");
        return ok(`Canvas cleared. ${result.count || 0} elements removed.`);
      } catch (e) {
        return err(`Clear failed: ${(e as Error).message}`);
      }
    },
  );

  // ─── snapshot_scene ───
  server.registerTool(
    "snapshot_scene",
    {
      description: "Save a named snapshot of the current canvas state for later restoration.",
      inputSchema: z.object({
        name: z.string().describe("Name for this snapshot"),
      }),
    },
    async ({ name }): Promise<CallToolResult> => {
      try {
        const result = await canvasPost("/api/snapshots", { name });
        return ok(`Snapshot "${name}" saved (${result.elementCount} elements)`);
      } catch (e) {
        return err(`Snapshot failed: ${(e as Error).message}`);
      }
    },
  );

  // ─── restore_snapshot ───
  server.registerTool(
    "restore_snapshot",
    {
      description: "Restore the canvas from a previously saved named snapshot.",
      inputSchema: z.object({
        name: z.string().describe("Name of the snapshot to restore"),
      }),
    },
    async ({ name }): Promise<CallToolResult> => {
      try {
        const snapData = await canvasGet(`/api/snapshots/${encodeURIComponent(name)}`);
        if (!snapData.snapshot) return err(`Snapshot "${name}" not found`);
        // Clear and restore
        await canvasDelete("/api/elements/clear");
        const result = await canvasPost("/api/elements/batch", { elements: (snapData.snapshot as any).elements });
        return ok(`Snapshot "${name}" restored (${result.count} elements)`);
      } catch (e) {
        return err(`Restore failed: ${(e as Error).message}`);
      }
    },
  );

  // ─── set_viewport ───
  server.registerTool(
    "set_viewport",
    {
      description: "Control the canvas viewport. Auto-fit all content, center on an element, or set zoom/scroll directly. Requires frontend open.",
      inputSchema: z.object({
        scrollToContent: z.boolean().optional().describe("Auto-fit all elements in view"),
        scrollToElementId: z.string().optional().describe("Center view on a specific element"),
        zoom: z.number().optional().describe("Zoom level (0.1–10, 1 = 100%)"),
        offsetX: z.number().optional().describe("Horizontal scroll offset"),
        offsetY: z.number().optional().describe("Vertical scroll offset"),
      }),
    },
    async (args): Promise<CallToolResult> => {
      try {
        const result = await canvasPost("/api/viewport", args);
        return ok(`Viewport updated: ${JSON.stringify(result)}`);
      } catch (e) {
        return err(`Viewport failed: ${(e as Error).message}`);
      }
    },
  );

  // ─── read_diagram_guide ───
  server.registerTool(
    "read_diagram_guide",
    {
      description: "Returns a comprehensive design guide for Excalidraw diagrams: colors, sizing, layout patterns, arrow binding, templates, and anti-patterns.",
      annotations: { readOnlyHint: true },
    },
    async (): Promise<CallToolResult> => {
      return ok(DIAGRAM_DESIGN_GUIDE);
    },
  );
}

// ─── Design Guide Content ───
const DIAGRAM_DESIGN_GUIDE = `# Excalidraw Diagram Design Guide

## Color Palette

### Stroke Colors (borders & text)
| Name    | Hex       | Use for                     |
|---------|-----------|-----------------------------|
| Black   | #1e1e1e   | Default text & borders      |
| Red     | #e03131   | Errors, warnings, critical  |
| Green   | #2f9e44   | Success, approved, healthy  |
| Blue    | #1971c2   | Primary actions, links      |
| Purple  | #9c36b5   | Services, middleware        |
| Orange  | #e8590c   | Async, queues, events       |
| Cyan    | #0c8599   | Data stores, databases      |
| Gray    | #868e96   | Annotations, secondary      |

### Fill Colors (pastel fills)
| Name         | Hex       | Pairs with stroke |
|--------------|-----------|-------------------|
| Light Red    | #ffc9c9   | #e03131           |
| Light Green  | #b2f2bb   | #2f9e44           |
| Light Blue   | #a5d8ff   | #1971c2           |
| Light Purple | #eebefa   | #9c36b5           |
| Light Orange | #ffd8a8   | #e8590c           |
| Light Cyan   | #99e9f2   | #0c8599           |
| Light Gray   | #e9ecef   | #868e96           |

## Sizing Rules
- Minimum shape: 120×60px
- Font sizes: body ≥16, titles ≥20, labels ≥14
- Padding: 20px inside shapes
- Arrow length: min 80px between shapes
- Grid snap: 20px

## Layout Patterns
- Spacing: 40–80px between shapes
- Flow: top-to-bottom or left-to-right
- Cluster related elements with background zones

## Arrow Binding
- Always use startBinding/endBinding with elementId
- Dashed for async, dotted for weak dependencies
- Label arrows with relationship text

## Anti-Patterns
1. Overlapping elements
2. Cramped spacing (<40px)
3. Tiny fonts (<14px)
4. Manual arrow coords (use bindings)
5. Too many colors (limit 3-4 fills)
6. Inconsistent sizes for same-role shapes
7. Missing labels
`;
