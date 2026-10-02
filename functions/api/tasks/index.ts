/**
 * GET  /api/tasks        -> list tasks (sorted by order)
 * POST /api/tasks        -> create a task
 */
import { Env, error, json, listIdFrom, loadTasks, newId, nowIso, readJson, saveTasks, Task, validateTaskInput } from "../_lib/store";

type Ctx = { request: Request; env: Env };

export const onRequestGet = async ({ request, env }: Ctx): Promise<Response> => {
  const listId = listIdFrom(request);
  if (!listId) return error("Missing or invalid X-List-Id header", 400);
  const tasks = await loadTasks(env, listId);
  tasks.sort((a, b) => a.order - b.order);
  return json(tasks);
};

export const onRequestPost = async ({ request, env }: Ctx): Promise<Response> => {
  const listId = listIdFrom(request);
  if (!listId) return error("Missing or invalid X-List-Id header", 400);
  const body = await readJson(request);
  if (body === undefined) return error("Invalid JSON body", 400);
  const v = validateTaskInput(body, { partial: false });
  if (!v.ok) return error(v.message, 400);

  const tasks = await loadTasks(env, listId);
  const ts = nowIso();
  const task: Task = {
    id: newId(),
    title: v.value.title!,
    notes: v.value.notes ?? "",
    done: v.value.done ?? false,
    priority: v.value.priority ?? "medium",
    dueDate: v.value.dueDate ?? null,
    order: tasks.length ? Math.max(...tasks.map((t) => t.order)) + 1 : 0,
    createdAt: ts,
    updatedAt: ts,
  };
  tasks.push(task);
  await saveTasks(env, listId, tasks);
  return json(task, 201);
};
