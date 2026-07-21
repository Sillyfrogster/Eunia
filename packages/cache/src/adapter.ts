export interface CacheAdapter {
  get(namespace: string, key: string): Promise<unknown | undefined>;
  set(
    namespace: string,
    key: string,
    value: unknown,
    ttl?: number,
  ): Promise<void>;
  delete(namespace: string, key: string): Promise<void>;
  keys(namespace: string, prefix?: string): Promise<string[]>;
  clear(namespace: string): Promise<void>;
  close(): Promise<void>;
}

export type CacheAdapterOperation =
  | "get"
  | "set"
  | "delete"
  | "keys"
  | "clear"
  | "close";

export interface CacheErrorContext {
  operation: CacheAdapterOperation;
  namespace: string;
  key?: string;
}

export type CacheErrorHandler = (
  error: unknown,
  context: CacheErrorContext,
) => unknown;
