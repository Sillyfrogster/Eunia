/**
 * Route binding. A caller binds a path template ("/channels/{channelId}/messages")
 * to parameter values once; the uninterpolated template doubles as the
 * rate-limit route key, so no per-request pattern matching is needed.
 */

const segment = (value: string): string =>
  value === "@me" || value === "@original" ? value : encodeURIComponent(value);

const privateRoutePart = (value: string): string => Bun.hash(value).toString(36);

export type QueryValue = string | number | boolean | null | undefined;

/** A bound route: interpolated request path plus its rate-limit identity. */
export interface RoutePath {
  /** Interpolated path sent on the wire, e.g. "/channels/123/messages". */
  path: string;
  /** Uninterpolated template; used directly as the rate-limit route key. */
  template: string;
  /** Major rate-limit parameter (channel/guild/webhook scope), "global" when none. */
  majorParam: string;
}

/** Binds a path template to parameter values. */
export function routePath(
  template: string,
  params: Readonly<Record<string, string>> = {},
): RoutePath {
  const path = template.replace(/\{([^}]+)\}/g, (_match, name: string) => {
    const value = params[name];
    if (value === undefined || value.length === 0) {
      throw new Error(`Route ${template} is missing the "${name}" parameter.`);
    }
    return segment(value);
  });
  return { path, template, majorParam: majorParamFor(template, params) };
}

function paramName(part: string | undefined): string | undefined {
  return part !== undefined && part.startsWith("{") && part.endsWith("}")
    ? part.slice(1, -1)
    : undefined;
}

function majorParamFor(
  template: string,
  params: Readonly<Record<string, string>>,
): string {
  const [, root, second, third] = template.split("/");
  const idName = paramName(second);
  const id = idName === undefined ? undefined : params[idName];
  if (id === undefined) return "global";

  if (root === "channels" || root === "guilds") return id;
  if (root === "webhooks" || root === "interactions") {
    const tokenName = paramName(third);
    const token = tokenName === undefined ? undefined : params[tokenName];
    return token === undefined ? id : `${id}:${privateRoutePart(token)}`;
  }
  return "global";
}

/** Adds defined query parameters to a route or raw path. */
export function withQuery(
  route: string,
  query: Readonly<Record<string, QueryValue | readonly QueryValue[]>>,
): string;
export function withQuery(
  route: RoutePath,
  query: Readonly<Record<string, QueryValue | readonly QueryValue[]>>,
): RoutePath;
export function withQuery(
  route: string | RoutePath,
  query: Readonly<Record<string, QueryValue | readonly QueryValue[]>>,
): string | RoutePath {
  const values = new URLSearchParams();
  for (const [name, raw] of Object.entries(query)) {
    const items = Array.isArray(raw) ? raw : [raw];
    for (const value of items) {
      if (value !== undefined && value !== null) values.append(name, String(value));
    }
  }
  const encoded = values.toString();
  if (encoded.length === 0) return route;
  if (typeof route === "string") return `${route}?${encoded}`;
  return { ...route, path: `${route.path}?${encoded}` };
}
