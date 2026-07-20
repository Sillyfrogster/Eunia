import type { Awaitable } from "@eunia/types";
import type { Client } from "./client";

export interface EuniaModule {
  readonly name: string;
  readonly dependsOn?: readonly string[];
  setup?(client: Client): Awaitable<void>;
  start?(client: Client): Awaitable<void>;
  stop?(client: Client): Awaitable<void>;
}

/** Orders modules so every dependency starts first. */
export function orderModules(modules: readonly EuniaModule[]): readonly EuniaModule[] {
  const byName = new Map<string, EuniaModule>();
  for (const module of modules) {
    if (module.name.trim().length === 0) throw new TypeError("Module names cannot be empty.");
    if (byName.has(module.name)) throw new Error(`Module "${module.name}" is registered twice.`);
    byName.set(module.name, module);
  }

  const ordered: EuniaModule[] = [];
  const visiting = new Set<string>();
  const visited = new Set<string>();

  const visit = (module: EuniaModule, path: readonly string[]): void => {
    if (visited.has(module.name)) return;
    if (visiting.has(module.name)) {
      throw new Error(`Module dependency cycle: ${[...path, module.name].join(" -> ")}.`);
    }

    visiting.add(module.name);
    for (const dependencyName of module.dependsOn ?? []) {
      const dependency = byName.get(dependencyName);
      if (dependency === undefined) {
        throw new Error(`Module "${module.name}" needs missing module "${dependencyName}".`);
      }
      visit(dependency, [...path, module.name]);
    }
    visiting.delete(module.name);
    visited.add(module.name);
    ordered.push(module);
  };

  for (const module of modules) visit(module, []);
  return Object.freeze(ordered);
}
