/**
 * File-backed persistent storage for canvas elements.
 */
import fs from "node:fs";
import path from "node:path";
import type { ServerElement, ExcalidrawFile, Snapshot } from "./types.js";

export interface CanvasState {
  elements: Record<string, ServerElement>;
  files: Record<string, ExcalidrawFile>;
  snapshots: Record<string, Snapshot>;
}

const DEFAULT_STATE: CanvasState = { elements: {}, files: {}, snapshots: {} };

export class CanvasStorage {
  private filePath: string;
  private state: CanvasState;
  private saveTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(filePath?: string) {
    this.filePath = filePath || process.env.CANVAS_STORE_PATH || "./canvas-state.json";
    this.state = this.loadFromDisk();
  }

  private loadFromDisk(): CanvasState {
    try {
      if (fs.existsSync(this.filePath)) {
        const raw = fs.readFileSync(this.filePath, "utf-8");
        return JSON.parse(raw);
      }
    } catch (e) {
      console.error(`Failed to load canvas state from ${this.filePath}:`, e);
    }
    return { ...DEFAULT_STATE };
  }

  /** Debounced save — writes at most once per 500ms */
  private scheduleSave(): void {
    if (this.saveTimer) return;
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null;
      try {
        const dir = path.dirname(this.filePath);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(this.filePath, JSON.stringify(this.state, null, 2));
      } catch (e) {
        console.error("Failed to save canvas state:", e);
      }
    }, 500);
  }

  // Element CRUD
  getElements(): ServerElement[] {
    return Object.values(this.state.elements);
  }

  getElement(id: string): ServerElement | undefined {
    return this.state.elements[id];
  }

  setElement(el: ServerElement): void {
    this.state.elements[el.id] = el;
    this.scheduleSave();
  }

  deleteElement(id: string): boolean {
    if (!(id in this.state.elements)) return false;
    delete this.state.elements[id];
    this.scheduleSave();
    return true;
  }

  clearElements(): number {
    const count = Object.keys(this.state.elements).length;
    this.state.elements = {};
    this.scheduleSave();
    return count;
  }

  get elementCount(): number {
    return Object.keys(this.state.elements).length;
  }

  // Files
  getFiles(): Record<string, ExcalidrawFile> {
    return this.state.files;
  }

  setFile(f: ExcalidrawFile): void {
    this.state.files[f.id] = f;
    this.scheduleSave();
  }

  deleteFile(id: string): boolean {
    if (!(id in this.state.files)) return false;
    delete this.state.files[id];
    this.scheduleSave();
    return true;
  }

  // Snapshots
  getSnapshots(): Snapshot[] {
    return Object.values(this.state.snapshots);
  }

  getSnapshot(name: string): Snapshot | undefined {
    return this.state.snapshots[name];
  }

  setSnapshot(s: Snapshot): void {
    this.state.snapshots[s.name] = s;
    this.scheduleSave();
  }

  /** Force immediate save */
  flush(): void {
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
      this.saveTimer = null;
    }
    try {
      const dir = path.dirname(this.filePath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(this.filePath, JSON.stringify(this.state, null, 2));
    } catch (e) {
      console.error("Failed to flush canvas state:", e);
    }
  }
}
