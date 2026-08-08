import type { StorageAdapter } from "grammy";
import { resolveSessionStorage } from "./session/redis.js";

/**
 * Small application-data store built on the toolkit's configured persistence.
 * Collections must maintain their own index keys; this API intentionally has no
 * list/scan operation. Workers route records through the supplied ChatDO.
 */
export class PersistentStore {
  private readonly nodeStorage: StorageAdapter<Record<string, unknown>> =
    resolveSessionStorage<Record<string, unknown>>(undefined);

  private workerStub(ctx: { env?: Record<string, unknown> }):
    | { fetch(input: string, init?: { method?: string; body?: string }): Promise<Response> }
    | undefined {
    const env = ctx.env;
    const namespace = env?.CHAT_DO as
      | { idFromName(name: string): unknown; get(id: unknown): { fetch(input: string, init?: { method?: string; body?: string }): Promise<Response> } }
      | undefined;
    return namespace?.get(namespace.idFromName("app:data"));
  }

  async get<T>(ctx: { env?: Record<string, unknown> }, key: string): Promise<T | undefined> {
    const stub = this.workerStub(ctx);
    if (!stub) return (await this.nodeStorage.read(key)) as unknown as T | undefined;
    const response = await stub.fetch(`https://do/data/${encodeURIComponent(key)}`);
    if (response.status === 204) return undefined;
    if (!response.ok) throw new Error("Could not read saved data.");
    return (await response.json()) as T;
  }

  async set<T>(ctx: { env?: Record<string, unknown> }, key: string, value: T): Promise<void> {
    const stub = this.workerStub(ctx);
    if (!stub) {
      await this.nodeStorage.write(key, value as Record<string, unknown>);
      return;
    }
    const response = await stub.fetch(`https://do/data/${encodeURIComponent(key)}`, {
      method: "PUT",
      body: JSON.stringify(value),
    });
    if (!response.ok) throw new Error("Could not save data.");
  }

  async delete(ctx: { env?: Record<string, unknown> }, key: string): Promise<void> {
    const stub = this.workerStub(ctx);
    if (!stub) {
      await this.nodeStorage.delete(key);
      return;
    }
    const response = await stub.fetch(`https://do/data/${encodeURIComponent(key)}`, { method: "DELETE" });
    if (!response.ok) throw new Error("Could not update saved data.");
  }
}
