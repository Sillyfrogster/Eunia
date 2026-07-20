/**
 * Command-scoped component listeners. A command declares
 * `confirm = onButton(async (ctx, args) => …)`; components reference the
 * handler (`this.confirm.button({...}, ...args)`), which derives the wire
 * custom_id from command + field + args. Args travel as strings and arrive
 * as strings.
 */
import { ButtonStyle, ComponentType } from "@eunia/types";
import type * as types from "@eunia/types";
import type { Awaitable, ListenerContext } from "./types";

export type ListenerKind = "button" | "select" | "modal";

/** custom_id shape: `<command>.<field>` plus one `:`-separated segment per arg. */
const ROUTE_SEPARATOR = ":";
const CUSTOM_ID_LIMIT = 100;

export interface ListenerButtonInput {
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

export type ListenerModalInput = Omit<types.ModalInteractionResponseData, "custom_id">;

export type ListenerHandler<K extends ListenerKind> = (
  context: ListenerContext<K>,
  args: readonly string[],
) => Awaitable<void>;

abstract class ListenerFieldBase<K extends ListenerKind> {
  /** Route prefix (`<command>.<field>`); assigned at registration. */
  route = "";

  constructor(
    readonly kind: K,
    readonly handler: ListenerHandler<K>,
  ) {}

  protected customId(args: readonly string[]): string {
    if (this.route.length === 0) {
      throw new Error("This listener field is not registered to a command.");
    }
    for (const arg of args) {
      if (arg.includes(ROUTE_SEPARATOR)) {
        throw new TypeError(`Listener args cannot contain "${ROUTE_SEPARATOR}".`);
      }
    }
    const id = [this.route, ...args].join(ROUTE_SEPARATOR);
    if ([...id].length > CUSTOM_ID_LIMIT) {
      throw new RangeError(`The derived custom_id "${id}" exceeds 100 characters.`);
    }
    return id;
  }
}

export class ButtonListenerField extends ListenerFieldBase<"button"> {
  constructor(handler: ListenerHandler<"button">) {
    super("button", handler);
  }

  /** Produces plain button component data carrying the derived custom_id. */
  button(input: ListenerButtonInput = {}, ...args: readonly string[]): types.ButtonComponent {
    const { style, ...rest } = input;
    return {
      type: ComponentType.Button,
      style: style ?? ButtonStyle.Primary,
      custom_id: this.customId(args),
      ...rest,
    };
  }
}

export class SelectListenerField extends ListenerFieldBase<"select"> {
  constructor(handler: ListenerHandler<"select">) {
    super("select", handler);
  }

  /** Produces plain select component data carrying the derived custom_id. */
  select(
    input: ListenerSelectInput,
    ...args: readonly string[]
  ): types.StringSelectComponent | types.AutoSelectComponent {
    return {
      ...input,
      type: input.type ?? ComponentType.StringSelect,
      custom_id: this.customId(args),
    } as types.StringSelectComponent | types.AutoSelectComponent;
  }
}

export class ModalListenerField extends ListenerFieldBase<"modal"> {
  constructor(handler: ListenerHandler<"modal">) {
    super("modal", handler);
  }

  /** Produces modal callback data carrying the derived custom_id. */
  modal(input: ListenerModalInput, ...args: readonly string[]): types.ModalInteractionResponseData {
    return { ...input, custom_id: this.customId(args) };
  }
}

export type ListenerField =
  | ButtonListenerField
  | SelectListenerField
  | ModalListenerField;

export function onButton(handler: ListenerHandler<"button">): ButtonListenerField {
  return new ButtonListenerField(handler);
}

export function onSelect(handler: ListenerHandler<"select">): SelectListenerField {
  return new SelectListenerField(handler);
}

export function onModal(handler: ListenerHandler<"modal">): ModalListenerField {
  return new ModalListenerField(handler);
}

export function isListenerField(value: unknown): value is ListenerField {
  return value instanceof ListenerFieldBase;
}

/** Splits an incoming custom_id into its route and args; null when not ours. */
export function parseListenerCustomId(
  customId: string,
): { route: string; args: readonly string[] } | null {
  const [route, ...args] = customId.split(ROUTE_SEPARATOR);
  if (route === undefined || !route.includes(".")) return null;
  return { route, args };
}
