/**
 * GET    /api/tasks/:id  -> one task
 * PATCH  /api/tasks/:id  -> update fields (title, notes, done, priority, dueDate)
 * DELETE /api/tasks/:id  -> remove
 */
import { Env, error, json, listIdFrom, loadTasks, nowIso, readJson, saveTasks, validateTaskInput } from "../_lib/store";

type Ctx = { request: Request; env: Env; params: { id: string } };

export const onRequestGet = async ({ request, env, params }: Ctx): Promise<Response> => {
  const listId = listIdFrom(request);
  if (!listId) return error("Missing or invalid X-List-Id header", 400);
  const task = (await loadTasks(env, listId)).find((t) => t.id === params.id);
  return task ? json(task) : error("Task not found", 404);
};

export const onRequestPatch = async ({ request, env, params }: Ctx): Promise<Response> => {
  const listId = listIdFrom(request);
  if (!listId) return error("Missing or invalid X-List-Id header", 400);
  const body = await readJson(request);
  if (body === undefined) return error("Invalid JSON body", 400);
  const v = validateTaskInput(body, { partial: true });
  if (!v.ok) return error(v.message, 400);
  if (Object.keys(v.value).length === 0) return error("No updatable fields provided", 400);

  const tasks = await loadTasks(env, listId);
  const idx = tasks.findIndex((t) => t.id === params.id);
  if (idx === -1) return error("Task not found", 404);
  tasks[idx] = { ...tasks[idx], ...v.value, updatedAt: nowIso() };
  await saveTasks(env, listId, tasks);
  return json(tasks[idx]);
};

export const onRequestDelete = async ({ request, env, params }: Ctx): Promise<Response> => {
  const listId = listIdFrom(request);
  if (!listId) return error("Missing or invalid X-List-Id header", 400);
  const tasks = await loadTasks(env, listId);
  const idx = tasks.findIndex((t) => t.id === params.id);
  if (idx === -1) return error("Task not found", 404);
  tasks.splice(idx, 1);
  await saveTasks(env, listId, tasks);
  return new Response(null, { status: 204 });
};
