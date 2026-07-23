const snapshots = new WeakSet<object>();

export function copySnapshot<T>(value: T): Readonly<T> {
  if (!isObject(value) || snapshots.has(value)) return value;
  return adoptSnapshot(structuredClone(value));
}

export function adoptSnapshot<T>(value: T): Readonly<T> {
  if (!isObject(value) || snapshots.has(value)) return value;
  freezeGraph(value, new WeakSet());
  return value;
}

function freezeGraph(value: object, visiting: WeakSet<object>): void {
  if (snapshots.has(value) || visiting.has(value)) return;
  visiting.add(value);

  for (const key of Reflect.ownKeys(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (descriptor !== undefined && "value" in descriptor && isObject(descriptor.value)) {
      freezeGraph(descriptor.value, visiting);
    }
  }

  Object.freeze(value);
  snapshots.add(value);
  visiting.delete(value);
}

function isObject(value: unknown): value is object {
  return value !== null && typeof value === "object";
}
