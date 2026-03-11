/**
 * Shared types for the canvas server and MCP tools.
 * Adapted from yctimlin/mcp_excalidraw with simplifications.
 */

export type ExcalidrawElementType =
  | "rectangle"
  | "ellipse"
  | "diamond"
  | "arrow"
  | "text"
  | "line"
  | "freedraw"
  | "image";

export const EXCALIDRAW_ELEMENT_TYPES: Record<string, ExcalidrawElementType> = {
  RECTANGLE: "rectangle",
  ELLIPSE: "ellipse",
  DIAMOND: "diamond",
  ARROW: "arrow",
  TEXT: "text",
  FREEDRAW: "freedraw",
  LINE: "line",
  IMAGE: "image",
} as const;

export interface ServerElement {
  id: string;
  type: ExcalidrawElementType;
  x: number;
  y: number;
  width?: number;
  height?: number;
  angle?: number;
  strokeColor?: string;
  backgroundColor?: string;
  fillStyle?: string;
  strokeWidth?: number;
  strokeStyle?: string;
  roughness?: number;
  opacity?: number;
  groupIds?: string[];
  frameId?: string | null;
  roundness?: { type: number; value?: number } | null;
  seed?: number;
  versionNonce?: number;
  isDeleted?: boolean;
  locked?: boolean;
  link?: string | null;
  boundElements?: { id: string; type: "text" | "arrow" }[] | null;
  containerId?: string | null;
  // Text
  text?: string;
  originalText?: string;
  fontSize?: number;
  fontFamily?: string | number;
  textAlign?: string;
  verticalAlign?: string;
  lineHeight?: number;
  autoResize?: boolean;
  // Label (for shapes)
  label?: { text: string };
  // Arrow/line
  points?: any;
  startBinding?: any;
  endBinding?: any;
  startArrowhead?: string | null;
  endArrowhead?: string | null;
  elbowed?: boolean;
  start?: { id: string };
  end?: { id: string };
  lastCommittedPoint?: any;
  // Image
  fileId?: string;
  status?: string;
  scale?: [number, number];
  // Server metadata
  createdAt?: string;
  updatedAt?: string;
  version?: number;
  [key: string]: any;
}

export interface WebSocketMessage {
  type: string;
  [key: string]: any;
}

export interface ExcalidrawFile {
  id: string;
  dataURL: string;
  mimeType: string;
  created: number;
}

export interface Snapshot {
  name: string;
  elements: ServerElement[];
  createdAt: string;
}

export function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).substring(2);
}

export function normalizeFontFamily(fontFamily: string | number | undefined): number | undefined {
  if (fontFamily === undefined) return undefined;
  if (typeof fontFamily === "number") return fontFamily;
  const map: Record<string, number> = {
    virgil: 1, hand: 1, handwritten: 1,
    helvetica: 2, sans: 2, "sans-serif": 2,
    cascadia: 3, mono: 3, monospace: 3,
    excalifont: 5, nunito: 6,
    lilita: 7, "lilita one": 7,
    "comic shanns": 8, comic: 8,
  };
  return map[fontFamily.toLowerCase()] ?? (parseInt(fontFamily) || undefined);
}
