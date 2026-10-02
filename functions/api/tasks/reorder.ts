/**
 * PUT /api/tasks/reorder   body: { ids: string[] }
 * Sets the display order of tasks to match the given id sequence (drag-and-drop).
 */
import { Env, error, json, listIdFrom, loadTasks, nowIso, readJson, saveTasks } from "../_lib/store";

type Ctx = { request: Request; env: Env };

export const onRequestPut = async ({ request, env }: Ctx): Promise<Response> => {
  const listId = listIdFrom(request);
  if (!listId) return error("Missing or invalid X-List-Id header", 400);
  const body = (await readJson(request)) as { ids?: unknown } | undefined;
  if (!body || !Array.isArray(body.ids) || !body.ids.every((x) => typeof x === "string")) {
    return error("Body must be { ids: string[] }", 400);
  }
  const tasks = await loadTasks(env, listId);
  const known = new Set(tasks.map((t) => t.id));
  const ids = body.ids as string[];
  if (ids.length !== known.size || !ids.every((id) => known.has(id)) || new Set(ids).size !== ids.length) {
    return error("ids must contain every task id exactly once", 400);
  }
  const position = new Map(ids.map((id, i) => [id, i]));
  const ts = nowIso();
  for (const t of tasks) {
    const next = position.get(t.id)!;
    if (t.order !== next) {
      t.order = next;
      t.updatedAt = ts;
    }
  }
  tasks.sort((a, b) => a.order - b.order);
  await saveTasks(env, listId, tasks);
  return json(tasks);
};
