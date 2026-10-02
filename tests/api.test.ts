/**
 * Endpoint tests. Every API route is exercised against an in-memory KV so the
 * tests run anywhere in under a second. Run with: npm test
 */
import { describe, it, expect, beforeEach } from "vitest";
import * as list from "../functions/api/tasks/index";
import * as item from "../functions/api/tasks/[id]";
import * as reorder from "../functions/api/tasks/reorder";
import * as health from "../functions/api/health";
import type { Env, KVLike, Task } from "../functions/api/_lib/store";

class MemoryKV implements KVLike {
  store = new Map<string, string>();
  async get(key: string) { return this.store.get(key) ?? null; }
  async put(key: string, value: string) { this.store.set(key, value); }
}

const LIST = "test-list-0001";
let env: Env;

function req(method: string, path: string, body?: unknown, headers: Record<string, string> = { "X-List-Id": LIST }) {
  return new Request(`https://todo.test${path}`, {
    method,
    headers: { "Content-Type": "application/json", ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

async function create(body: unknown) {
  return list.onRequestPost({ request: req("POST", "/api/tasks", body), env });
}

beforeEach(() => { env = { TODO_KV: new MemoryKV() }; });

describe("GET /api/health", () => {
  it("returns ok", async () => {
    const res = await health.onRequestGet();
    expect(res.status).toBe(200);
    expect(((await res.json()) as { ok: boolean }).ok).toBe(true);
  });
});

describe("GET /api/tasks", () => {
  it("returns an empty array for a new list", async () => {
    const res = await list.onRequestGet({ request: req("GET", "/api/tasks"), env });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([]);
  });
  it("rejects a missing list id", async () => {
    const res = await list.onRequestGet({ request: req("GET", "/api/tasks", undefined, {}), env });
    expect(res.status).toBe(400);
  });
  it("rejects a malformed list id", async () => {
    const res = await list.onRequestGet({ request: req("GET", "/api/tasks", undefined, { "X-List-Id": "bad id!" }), env });
    expect(res.status).toBe(400);
  });
  it("returns tasks sorted by order", async () => {
    await create({ title: "first" });
    await create({ title: "second" });
    const tasks = (await (await list.onRequestGet({ request: req("GET", "/api/tasks"), env })).json()) as Task[];
    expect(tasks.map((t) => t.title)).toEqual(["first", "second"]);
    expect(tasks.map((t) => t.order)).toEqual([0, 1]);
  });
});

describe("POST /api/tasks", () => {
  it("creates a task with defaults", async () => {
    const res = await create({ title: "  Buy milk  " });
    expect(res.status).toBe(201);
    const t = (await res.json()) as Task;
    expect(t.title).toBe("Buy milk");
    expect(t.notes).toBe("");
    expect(t.done).toBe(false);
    expect(t.priority).toBe("medium");
    expect(t.dueDate).toBeNull();
    expect(t.id).toMatch(/^[0-9a-f-]{36}$/);
  });
  it("accepts notes, priority and due date", async () => {
    const t = (await (await create({ title: "Dentist", notes: "Ask about the crown", priority: "high", dueDate: "2026-10-09" })).json()) as Task;
    expect(t.notes).toBe("Ask about the crown");
    expect(t.priority).toBe("high");
    expect(t.dueDate).toBe("2026-10-09");
  });
  it("rejects a missing title", async () => {
    expect((await create({ notes: "no title" })).status).toBe(400);
  });
  it("rejects a blank title", async () => {
    expect((await create({ title: "   " })).status).toBe(400);
  });
  it("rejects an over-long title", async () => {
    expect((await create({ title: "x".repeat(201) })).status).toBe(400);
  });
  it("rejects an invalid priority", async () => {
    expect((await create({ title: "ok", priority: "urgent" })).status).toBe(400);
  });
  it("rejects an invalid due date", async () => {
    expect((await create({ title: "ok", dueDate: "next week" })).status).toBe(400);
  });
  it("rejects invalid JSON", async () => {
    const request = new Request("https://todo.test/api/tasks", { method: "POST", headers: { "X-List-Id": LIST }, body: "{not json" });
    expect((await list.onRequestPost({ request, env })).status).toBe(400);
  });
  it("isolates lists from each other", async () => {
    await create({ title: "mine" });
    const other = await list.onRequestGet({ request: req("GET", "/api/tasks", undefined, { "X-List-Id": "someone-else-01" }), env });
    expect(await other.json()).toEqual([]);
  });
});

describe("GET /api/tasks/:id", () => {
  it("returns the task", async () => {
    const t = (await (await create({ title: "Read" })).json()) as Task;
    const res = await item.onRequestGet({ request: req("GET", `/api/tasks/${t.id}`), env, params: { id: t.id } });
    expect(res.status).toBe(200);
    expect(((await res.json()) as Task).id).toBe(t.id);
  });
  it("404s for an unknown id", async () => {
    const res = await item.onRequestGet({ request: req("GET", "/api/tasks/nope"), env, params: { id: "nope" } });
    expect(res.status).toBe(404);
  });
});

describe("PATCH /api/tasks/:id", () => {
  it("updates fields and bumps updatedAt", async () => {
    const t = (await (await create({ title: "Draft" })).json()) as Task;
    await new Promise((r) => setTimeout(r, 2));
    const res = await item.onRequestPatch({ request: req("PATCH", `/api/tasks/${t.id}`, { title: "Final", done: true, notes: "Sent", priority: "low", dueDate: "2026-12-01" }), env, params: { id: t.id } });
    expect(res.status).toBe(200);
    const u = (await res.json()) as Task;
    expect(u).toMatchObject({ title: "Final", done: true, notes: "Sent", priority: "low", dueDate: "2026-12-01" });
    expect(u.createdAt).toBe(t.createdAt);
    expect(u.updatedAt > t.updatedAt).toBe(true);
  });
  it("clears a due date with null", async () => {
    const t = (await (await create({ title: "x", dueDate: "2026-10-09" })).json()) as Task;
    const u = (await (await item.onRequestPatch({ request: req("PATCH", `/api/tasks/${t.id}`, { dueDate: null }), env, params: { id: t.id } })).json()) as Task;
    expect(u.dueDate).toBeNull();
  });
  it("rejects an empty update", async () => {
    const t = (await (await create({ title: "x" })).json()) as Task;
    expect((await item.onRequestPatch({ request: req("PATCH", `/api/tasks/${t.id}`, {}), env, params: { id: t.id } })).status).toBe(400);
  });
  it("rejects a bad done value", async () => {
    const t = (await (await create({ title: "x" })).json()) as Task;
    expect((await item.onRequestPatch({ request: req("PATCH", `/api/tasks/${t.id}`, { done: "yes" }), env, params: { id: t.id } })).status).toBe(400);
  });
  it("404s for an unknown id", async () => {
    expect((await item.onRequestPatch({ request: req("PATCH", "/api/tasks/nope", { title: "x" }), env, params: { id: "nope" } })).status).toBe(404);
  });
});

describe("DELETE /api/tasks/:id", () => {
  it("removes the task", async () => {
    const t = (await (await create({ title: "Gone" })).json()) as Task;
    const res = await item.onRequestDelete({ request: req("DELETE", `/api/tasks/${t.id}`), env, params: { id: t.id } });
    expect(res.status).toBe(204);
    const remaining = (await (await list.onRequestGet({ request: req("GET", "/api/tasks"), env })).json()) as Task[];
    expect(remaining).toEqual([]);
  });
  it("404s for an unknown id", async () => {
    expect((await item.onRequestDelete({ request: req("DELETE", "/api/tasks/nope"), env, params: { id: "nope" } })).status).toBe(404);
  });
});

describe("PUT /api/tasks/reorder", () => {
  it("reorders tasks to the given sequence", async () => {
    const a = (await (await create({ title: "a" })).json()) as Task;
    const b = (await (await create({ title: "b" })).json()) as Task;
    const c = (await (await create({ title: "c" })).json()) as Task;
    const res = await reorder.onRequestPut({ request: req("PUT", "/api/tasks/reorder", { ids: [c.id, a.id, b.id] }), env });
    expect(res.status).toBe(200);
    const tasks = (await res.json()) as Task[];
    expect(tasks.map((t) => t.title)).toEqual(["c", "a", "b"]);
    expect(tasks.map((t) => t.order)).toEqual([0, 1, 2]);
  });
  it("rejects a sequence that misses or duplicates ids", async () => {
    const a = (await (await create({ title: "a" })).json()) as Task;
    await create({ title: "b" });
    expect((await reorder.onRequestPut({ request: req("PUT", "/api/tasks/reorder", { ids: [a.id] }), env })).status).toBe(400);
    expect((await reorder.onRequestPut({ request: req("PUT", "/api/tasks/reorder", { ids: [a.id, a.id] }), env })).status).toBe(400);
  });
  it("rejects a malformed body", async () => {
    expect((await reorder.onRequestPut({ request: req("PUT", "/api/tasks/reorder", { ids: "a,b" }), env })).status).toBe(400);
  });
});
