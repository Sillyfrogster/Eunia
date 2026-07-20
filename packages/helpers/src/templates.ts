/**
 * Content templates. Three verbs: define (code only, one object of plain
 * fill-to-payload functions), invoke with fills, override (third argument;
 * an override key replaces that key entirely, with no deep merge).
 */

// `any` keeps each template's own fills parameter type inferable through the map.
export type TemplateMap<P> = Record<string, (fills: any) => P>;

type FillsOf<F> = F extends (fills: infer P) => unknown ? P : never;

/** A callable template registry for one content domain. */
export interface TemplateRegistry<P, T extends TemplateMap<P> = TemplateMap<P>> {
  <K extends keyof T & string>(
    name: K,
    fills: FillsOf<T[K]>,
    override?: Partial<P>,
  ): P;
  /** The template names this registry defines. */
  readonly names: readonly (keyof T & string)[];
}

export function createRegistry<P extends object, T extends TemplateMap<P>>(
  domain: string,
  templates: T,
): TemplateRegistry<P, T> {
  const map = { ...templates };
  const invoke = (<K extends keyof T & string>(
    name: K,
    fills: FillsOf<T[K]>,
    override?: Partial<P>,
  ): P => {
    const template = map[name];
    if (template === undefined) {
      throw new Error(`No ${domain} template is named "${name}".`);
    }
    const produced = template(fills as never);
    return override === undefined ? produced : { ...produced, ...override };
  }) as TemplateRegistry<P, T> & { names: readonly (keyof T & string)[] };
  invoke.names = Object.freeze(Object.keys(map)) as readonly (keyof T & string)[];
  return invoke;
}

export function isRegistry(value: unknown): value is TemplateRegistry<object> {
  return typeof value === "function" && Array.isArray((value as { names?: unknown }).names);
}
