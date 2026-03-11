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
}
