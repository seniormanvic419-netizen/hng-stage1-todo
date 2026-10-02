/** GET /api/health -> { ok: true } */
import { json } from "./_lib/store";

export const onRequestGet = async (): Promise<Response> => json({ ok: true, service: "todo-api", time: new Date().toISOString() });
