import { randomUUID } from "node:crypto";

/** Short readable ids: need-3f9a1c2e, bundle-..., run-... */
export const newId = (prefix: string) => `${prefix}-${randomUUID().slice(0, 8)}`;
export const nowIso = () => new Date().toISOString();
export const todayIso = () => new Date().toISOString().slice(0, 10);
export const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
