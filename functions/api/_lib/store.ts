/**
 * Shared storage helpers for the To-Do API.
 * Each visitor has an anonymous list identified by an `X-List-Id` header; the
 * frontend generates one on first visit and keeps it in localStorage. The whole
 * list is stored as one JSON document in Cloudflare KV under that id.
 */

export type Priority = "low" | "medium" | "high";

export interface Task {
  id: string;
  title: string;
  notes: string;
  done: boolean;
  priority: Priority;
  dueDate: string | null; // ISO date (YYYY-MM-DD) or null
  order: number;
  createdAt: string;
  updatedAt: string;
}

export interface KVLike {
  get(key: string): Promise<string | null>;
  put(key: string, value: string): Promise<void>;
}

export interface Env {
  TODO_KV: KVLike;
}

export const PRIORITIES: Priority[] = ["low", "medium", "high"];
const LIST_ID_PATTERN = /^[A-Za-z0-9_-]{8,64}$/;
const MAX_TITLE = 200;
const MAX_NOTES = 5000;

export function listIdFrom(request: Request): string | null {
  const id = request.headers.get("X-List-Id");
  return id && LIST_ID_PATTERN.test(id) ? id : null;
}

export async function loadTasks(env: Env, listId: string): Promise<Task[]> {
  const raw = await env.TODO_KV.get(`list:${listId}`);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as Task[]) : [];
  } catch {
    return [];
  }
}

export async function saveTasks(env: Env, listId: string, tasks: Task[]): Promise<void> {
  await env.TODO_KV.put(`list:${listId}`, JSON.stringify(tasks));
}

export function json(data: unknown, status = 200, extra: HeadersInit = {}): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...extra },
  });
}

export function error(message: string, status: number): Response {
  return json({ error: message }, status);
}

export function newId(): string {
  return crypto.randomUUID();
}

export function nowIso(): string {
  return new Date().toISOString();
}

/** Validates a create/update payload. Returns the clean fields or an error string. */
export function validateTaskInput(
  body: unknown,
  { partial }: { partial: boolean }
): { ok: true; value: Partial<Pick<Task, "title" | "notes" | "done" | "priority" | "dueDate">> } | { ok: false; message: string } {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return { ok: false, message: "Body must be a JSON object" };
  }
  const b = body as Record<string, unknown>;
  const out: Partial<Pick<Task, "title" | "notes" | "done" | "priority" | "dueDate">> = {};

  if ("title" in b) {
    if (typeof b.title !== "string" || b.title.trim().length === 0) return { ok: false, message: "title must be a non-empty string" };
    if (b.title.length > MAX_TITLE) return { ok: false, message: `title must be at most ${MAX_TITLE} characters` };
    out.title = b.title.trim();
  } else if (!partial) {
    return { ok: false, message: "title is required" };
  }

  if ("notes" in b) {
    if (typeof b.notes !== "string") return { ok: false, message: "notes must be a string" };
    if (b.notes.length > MAX_NOTES) return { ok: false, message: `notes must be at most ${MAX_NOTES} characters` };
    out.notes = b.notes;
  }

  if ("done" in b) {
    if (typeof b.done !== "boolean") return { ok: false, message: "done must be a boolean" };
    out.done = b.done;
  }

  if ("priority" in b) {
    if (typeof b.priority !== "string" || !PRIORITIES.includes(b.priority as Priority)) {
      return { ok: false, message: "priority must be one of low, medium, high" };
    }
    out.priority = b.priority as Priority;
  }

  if ("dueDate" in b) {
    if (b.dueDate === null || b.dueDate === "") out.dueDate = null;
    else if (typeof b.dueDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(b.dueDate) && !Number.isNaN(Date.parse(b.dueDate))) out.dueDate = b.dueDate;
    else return { ok: false, message: "dueDate must be YYYY-MM-DD or null" };
  }

  return { ok: true, value: out };
}

export async function readJson(request: Request): Promise<unknown | undefined> {
  try {
    return await request.json();
  } catch {
    return undefined;
  }
}
