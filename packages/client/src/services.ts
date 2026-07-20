export type ServiceKey = string | symbol;

/** Stores services shared by Eunia modules. */
export class ServiceRegistry {
  private readonly services = new Map<ServiceKey, unknown>();

  provide<T>(key: ServiceKey, service: T): this {
    if (typeof key === "string" && key.trim().length === 0) {
      throw new TypeError("Service names cannot be empty.");
    }
    if (this.services.has(key)) {
      throw new Error(`A service is already registered for ${describeKey(key)}.`);
    }
    this.services.set(key, service);
    return this;
  }

  get<T>(key: ServiceKey): T {
    const service = this.services.get(key);
    if (service === undefined && !this.services.has(key)) {
      throw new Error(`No service is registered for ${describeKey(key)}.`);
    }
    return service as T;
  }

  resolve<T>(key: ServiceKey): T | undefined {
    return this.services.get(key) as T | undefined;
  }

  has(key: ServiceKey): boolean {
    return this.services.has(key);
  }

  delete(key: ServiceKey): boolean {
    return this.services.delete(key);
  }

  clear(): void {
    this.services.clear();
  }
}

function describeKey(key: ServiceKey): string {
  return typeof key === "symbol" ? key.description ?? "this symbol" : `"${key}"`;
}
