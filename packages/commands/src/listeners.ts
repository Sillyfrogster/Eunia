import { createHash } from "node:crypto";
import { ButtonStyle, ComponentType } from "@eunia/types";
import type * as types from "@eunia/types";
import type { CommandListenerMap } from "./command";
import { freezeAccess } from "./configuration";
import type {
  AutoDeferOptions,
  CommandAccess,
  CommandRateLimit,
  Awaitable,
  ListenerContext,
} from "./types";

export type ListenerKind = "button" | "select" | "modal";
type ListenerAutoDefer<K extends ListenerKind> =
  | boolean
  | (K extends "modal"
      ? AutoDeferOptions
      : Pick<AutoDeferOptions, "afterMs">);

const ROUTE_PREFIX = "e1.";
const ROUTE_SEPARATOR = ":";
const CUSTOM_ID_LIMIT = 100;

export interface ListenerButtonInput {
  readonly id?: number;
  readonly style?:
    | ButtonStyle.Primary
    | ButtonStyle.Secondary
    | ButtonStyle.Success
    | ButtonStyle.Danger;
  readonly label?: string;
  readonly emoji?: types.ComponentEmoji;
  readonly disabled?: boolean;
}

export type ListenerSelectInput =
  | (Omit<types.StringSelectComponent, "type" | "custom_id"> & {
      readonly type?: ComponentType.StringSelect;
    })
  | Omit<types.AutoSelectComponent, "custom_id">;

export type ListenerModalInput = Omit<
  types.ModalInteractionResponseData,
  "custom_id"
>;

export type ListenerHandler<K extends ListenerKind> = (
  context: ListenerContext<K>,
) => Awaitable<void>;

export interface ListenerOptions<
  K extends ListenerKind = ListenerKind,
> {
  readonly inheritAccess?: boolean;
  readonly access?: CommandAccess;
  readonly autoDefer?: ListenerAutoDefer<K>;
  readonly rateLimit?: CommandRateLimit;
}

declare const listenerFieldBrand: unique symbol;

interface ListenerDefinition<K extends ListenerKind> {
  readonly [listenerFieldBrand]: K;
  readonly kind: K;
  readonly handler: ListenerHandler<K>;
  readonly inheritAccess: boolean;
  readonly access?: CommandAccess;
  readonly autoDefer?: ListenerAutoDefer<K>;
  readonly rateLimit?: CommandRateLimit;
}

class ListenerFieldDefinition<K extends ListenerKind> {
  readonly inheritAccess: boolean;
  readonly access?: CommandAccess;
  readonly autoDefer?: ListenerAutoDefer<K>;
  readonly rateLimit?: CommandRateLimit;

  constructor(
    readonly kind: K,
    readonly handler: ListenerHandler<K>,
    options: ListenerOptions<K> = {},
  ) {
    this.inheritAccess = options.inheritAccess ?? true;
    if (options.access !== undefined) {
      this.access = freezeAccess(options.access);
    }
    if (options.autoDefer !== undefined) {
      if (typeof options.autoDefer === "boolean") {
        this.autoDefer = options.autoDefer;
      } else {
        if (
          typeof options.autoDefer !== "object" ||
          options.autoDefer === null ||
          Array.isArray(options.autoDefer)
        ) {
          throw new TypeError(
            "Listener auto-defer settings must be a boolean or an object.",
          );
        }
        this.autoDefer = Object.freeze({ ...options.autoDefer });
      }
    }
    if (options.rateLimit !== undefined) {
      this.rateLimit = Object.freeze({ ...options.rateLimit });
    }
    Object.freeze(this);
  }
}

export type ButtonListenerField = ListenerDefinition<"button">;
export type SelectListenerField = ListenerDefinition<"select">;
export type ModalListenerField = ListenerDefinition<"modal">;

export type ListenerField =
  | ButtonListenerField
  | SelectListenerField
  | ModalListenerField;

export interface ButtonListenerHandle {
  button(
    input?: ListenerButtonInput,
    ...args: readonly string[]
  ): types.ButtonComponent;
}

export interface SelectListenerHandle {
  select(
    input: ListenerSelectInput,
    ...args: readonly string[]
  ): types.StringSelectComponent | types.AutoSelectComponent;
}

export interface ModalListenerHandle {
  modal(
    input: ListenerModalInput,
    ...args: readonly string[]
  ): types.ModalInteractionResponseData;
}

export interface ListenerBuilders {
  button(
    listener: string,
    input?: ListenerButtonInput,
    ...args: readonly string[]
  ): types.ButtonComponent;
  select(
    listener: string,
    input: ListenerSelectInput,
    ...args: readonly string[]
  ): types.StringSelectComponent | types.AutoSelectComponent;
  modal(
    listener: string,
    input: ListenerModalInput,
    ...args: readonly string[]
  ): types.ModalInteractionResponseData;
}

export type ListenerHandle<F extends ListenerField> =
  F extends ButtonListenerField
    ? ButtonListenerHandle
    : F extends SelectListenerField
      ? SelectListenerHandle
      : ModalListenerHandle;

export type ListenerHandles<L extends CommandListenerMap> = Readonly<{
  [K in keyof L]: L[K] extends ListenerField ? ListenerHandle<L[K]> : never;
}>;

export function onButton(
  handler: ListenerHandler<"button">,
  options?: ListenerOptions<"button">,
): ButtonListenerField {
  return new ListenerFieldDefinition(
    "button",
    handler,
    options,
  ) as ButtonListenerField;
}

export function onSelect(
  handler: ListenerHandler<"select">,
  options?: ListenerOptions<"select">,
): SelectListenerField {
  return new ListenerFieldDefinition(
    "select",
    handler,
    options,
  ) as SelectListenerField;
}

export function onModal(
  handler: ListenerHandler<"modal">,
  options?: ListenerOptions<"modal">,
): ModalListenerField {
  return new ListenerFieldDefinition(
    "modal",
    handler,
    options,
  ) as ModalListenerField;
}

export function isListenerField(value: unknown): value is ListenerField {
  return value instanceof ListenerFieldDefinition;
}

export function listenerRoute(address: readonly string[]): string {
  const digest = createHash("sha256")
    .update(JSON.stringify(address))
    .digest()
    .subarray(0, 12)
    .toString("base64url");
  return `${ROUTE_PREFIX}${digest}`;
}

export function bindListener<F extends ListenerField>(
  field: F,
  route: string,
): ListenerHandle<F> {
  if (field.kind === "button") {
    return Object.freeze({
      button(input: ListenerButtonInput = {}, ...args: readonly string[]) {
        const { style, ...rest } = input;
        return {
          ...rest,
          type: ComponentType.Button,
          style: style ?? ButtonStyle.Primary,
          custom_id: customId(route, args),
        };
      },
    }) as ListenerHandle<F>;
  }
  if (field.kind === "select") {
    return Object.freeze({
      select(input: ListenerSelectInput, ...args: readonly string[]) {
        return {
          ...input,
          type: input.type ?? ComponentType.StringSelect,
          custom_id: customId(route, args),
        } as types.StringSelectComponent | types.AutoSelectComponent;
      },
    }) as ListenerHandle<F>;
  }
  return Object.freeze({
    modal(input: ListenerModalInput, ...args: readonly string[]) {
      return { ...input, custom_id: customId(route, args) };
    },
  }) as ListenerHandle<F>;
}

export function bindListenerBuilders(
  handles: Readonly<Record<string, ListenerHandle<ListenerField>>>,
): ListenerBuilders {
  return Object.freeze({
    button(
      listener: string,
      input: ListenerButtonInput = {},
      ...args: readonly string[]
    ) {
      const handle = listenerHandle(handles, listener, "button");
      return handle.button(input, ...args);
    },
    select(
      listener: string,
      input: ListenerSelectInput,
      ...args: readonly string[]
    ) {
      const handle = listenerHandle(handles, listener, "select");
      return handle.select(input, ...args);
    },
    modal(
      listener: string,
      input: ListenerModalInput,
      ...args: readonly string[]
    ) {
      const handle = listenerHandle(handles, listener, "modal");
      return handle.modal(input, ...args);
    },
  });
}

export function parseListenerCustomId(
  customId: string,
): { route: string; args: readonly string[] } | null {
  const [route, ...encoded] = customId.split(ROUTE_SEPARATOR);
  if (route === undefined || !route.startsWith(ROUTE_PREFIX)) return null;
  try {
    return {
      route,
      args: Object.freeze(encoded.map((value) => decodeURIComponent(value))),
    };
  } catch {
    return null;
  }
}

function customId(route: string, args: readonly string[]): string {
  let encoded: readonly string[];
  try {
    encoded = args.map((value) => encodeURIComponent(value));
  } catch {
    throw new TypeError("Listener args must contain valid Unicode.");
  }
  const id = [route, ...encoded].join(ROUTE_SEPARATOR);
  if ([...id].length > CUSTOM_ID_LIMIT) {
    throw new RangeError("The listener custom_id exceeds 100 characters.");
  }
  return id;
}

function listenerHandle<K extends ListenerKind>(
  handles: Readonly<Record<string, ListenerHandle<ListenerField>>>,
  name: string,
  kind: K,
): K extends "button"
  ? ButtonListenerHandle
  : K extends "select"
    ? SelectListenerHandle
    : ModalListenerHandle {
  const handle = Object.hasOwn(handles, name)
    ? handles[name]
    : undefined;
  if (handle === undefined || !(kind in handle)) {
    throw new RangeError(
      `Listener "${name}" is not a ${kind} listener on this command.`,
    );
  }
  return handle as K extends "button"
    ? ButtonListenerHandle
    : K extends "select"
      ? SelectListenerHandle
      : ModalListenerHandle;
}
