import {
  ComponentType,
  MessageFlags,
  MessageReferenceType,
} from "@eunia/types";
import type * as types from "@eunia/types";

/**
 * The universal content input accepted by every content-bearing verb:
 * a plain string, one embed, an embed list, or the full payload object.
 */
export type Sendable =
  | string
  | types.Embed
  | readonly types.Embed[]
  | types.MessageCreate
  | types.MessageEdit;

export interface MessageRequestParts<T> {
  body: Omit<T, "files">;
  files: types.MessageCreate["files"] | undefined;
}

const MESSAGE_PAYLOAD_KEYS: ReadonlySet<string> = new Set([
  "content",
  "embeds",
  "components",
  "files",
  "attachments",
  "flags",
  "allowed_mentions",
  "message_reference",
  "sticker_ids",
  "nonce",
  "enforce_nonce",
  "tts",
  "poll",
  "shared_client_theme",
]);

function isPayloadObject(value: object): value is types.MessageCreate | types.MessageEdit {
  const keys = Object.keys(value);
  return keys.length === 0 || keys.some((key) => MESSAGE_PAYLOAD_KEYS.has(key));
}

/** Normalizes a Sendable into a wire payload; "edit" permits null resets. */
export function normalizeSendable(input: Sendable, mode?: "create"): types.MessageCreate;
export function normalizeSendable(input: Sendable, mode: "edit"): types.MessageEdit;
export function normalizeSendable(
  input: Sendable,
  mode: "create" | "edit" = "create",
): types.MessageCreate | types.MessageEdit {
  if (typeof input === "string") {
    return checkedMessage<types.MessageCreate>({ content: input }, mode);
  }
  if (Array.isArray(input)) {
    return checkedMessage<types.MessageCreate>(
      { embeds: [...(input as readonly types.Embed[])] },
      mode,
    );
  }
  if (!isPayloadObject(input)) {
    return checkedMessage<types.MessageCreate>({ embeds: [input as types.Embed] }, mode);
  }
  return checkedMessage({ ...(input as types.MessageCreate) }, mode);
}

export function splitMessageFiles<
  T extends { files?: types.MessageCreate["files"] },
>(data: T): MessageRequestParts<T> {
  const { files, ...body } = data;
  return { body, files };
}

function checkedMessage<T extends types.MessageCreate | types.MessageEdit>(
  data: T,
  mode: "create" | "edit",
): T {
  if (data.content !== undefined && data.content !== null && [...data.content].length > 2_000) {
    throw new RangeError("Message content cannot exceed 2000 characters.");
  }
  if (data.embeds !== undefined && data.embeds !== null && data.embeds.length > 10) {
    throw new RangeError("Messages cannot contain more than 10 embeds.");
  }
  if (data.embeds !== undefined && data.embeds !== null) {
    const total = data.embeds.reduce((length, embed) => length + embedTextLength(embed), 0);
    if (total > 6_000) {
      throw new RangeError("A message cannot contain more than 6000 embed text characters.");
    }
  }
  if ((data.files?.length ?? 0) > 10) {
    throw new RangeError("Messages cannot upload more than 10 files at once.");
  }
  if ((data.attachments?.length ?? 0) > 10) {
    throw new RangeError("Messages cannot contain more than 10 attachments.");
  }

  const componentsV2 = ((data.flags ?? 0) & MessageFlags.IsComponentsV2) !== 0;
  if (data.components !== undefined && data.components !== null) {
    if (
      !componentsV2 &&
      data.components.some((component) => containsV2Component(component))
    ) {
      throw new TypeError("Components V2 layouts need MessageFlags.IsComponentsV2.");
    }
    if (!componentsV2 && data.components.length > 5) {
      throw new RangeError("Legacy messages cannot contain more than five action rows.");
    }
    const total = data.components.reduce(
      (count, component) => count + countComponents(component),
      0,
    );
    if (total > 40) {
      throw new RangeError("Messages cannot contain more than 40 components.");
    }
  }
  if (componentsV2) validateComponentsV2Fields(data, mode);
  if (mode === "create") validateMessageCreate(data as types.MessageCreate);
  return data;
}

function validateMessageCreate(data: types.MessageCreate): void {
  const hasBody =
    (data.content !== undefined && data.content.length > 0) ||
    (data.embeds?.length ?? 0) > 0 ||
    (data.sticker_ids?.length ?? 0) > 0 ||
    (data.components?.length ?? 0) > 0 ||
    (data.files?.length ?? 0) > 0 ||
    data.poll !== undefined ||
    data.shared_client_theme !== undefined ||
    (data.message_reference?.type === MessageReferenceType.Forward &&
      data.message_reference.message_id !== undefined);
  if (!hasBody) {
    throw new TypeError(
      "Message creates need content, embeds, components, files, stickers, a poll, a shared theme, or a forward reference.",
    );
  }
}

interface ComponentsV2MessageFields {
  content?: string | null;
  embeds?: types.Embed[] | null;
  sticker_ids?: types.MessageCreate["sticker_ids"];
  poll?: types.MessageCreate["poll"] | null;
  shared_client_theme?: types.MessageCreate["shared_client_theme"];
}

function validateComponentsV2Fields(
  data: types.MessageCreate | types.MessageEdit,
  mode: "create" | "edit",
): void {
  const fields = data as ComponentsV2MessageFields;
  if (mode === "create") {
    if (
      fields.content !== undefined ||
      fields.embeds !== undefined ||
      fields.sticker_ids !== undefined ||
      fields.poll !== undefined ||
      fields.shared_client_theme !== undefined
    ) {
      throw new TypeError(
        "Components V2 message creates cannot include content, embeds, stickers, polls, or shared themes.",
      );
    }
    return;
  }

  const contentIsReset = fields.content === undefined || fields.content === null;
  const embedsAreReset = fields.embeds === undefined || fields.embeds?.length === 0;
  const stickersAreReset = fields.sticker_ids === undefined || fields.sticker_ids.length === 0;
  const pollIsReset = fields.poll === undefined || fields.poll === null;
  if (
    !contentIsReset ||
    !embedsAreReset ||
    !stickersAreReset ||
    !pollIsReset ||
    fields.shared_client_theme !== undefined
  ) {
    throw new TypeError(
      "Components V2 message edits can only clear content, embeds, stickers, or polls.",
    );
  }
}

function embedTextLength(embed: types.Embed): number {
  return [
    embed.title,
    embed.description,
    embed.footer?.text,
    embed.author?.name,
    ...(embed.fields?.flatMap((field) => [field.name, field.value]) ?? []),
  ].reduce((total, value) => total + (value === undefined ? 0 : [...value].length), 0);
}

const COMPONENTS_V2_TYPES: ReadonlySet<ComponentType> = new Set([
  ComponentType.Section,
  ComponentType.TextDisplay,
  ComponentType.Thumbnail,
  ComponentType.MediaGallery,
  ComponentType.File,
  ComponentType.Separator,
  ComponentType.Container,
]);

function containsV2Component(component: object): boolean {
  const record = component as {
    type?: ComponentType;
    components?: object[];
    component?: object;
    accessory?: object;
  };
  return (
    (record.type !== undefined && COMPONENTS_V2_TYPES.has(record.type)) ||
    record.components?.some(containsV2Component) === true ||
    (record.component !== undefined && containsV2Component(record.component)) ||
    (record.accessory !== undefined && containsV2Component(record.accessory))
  );
}

function countComponents(component: object): number {
  const record = component as {
    components?: object[];
    component?: object;
    accessory?: object;
  };
  return (
    1 +
    (record.components?.reduce((count, child) => count + countComponents(child), 0) ?? 0) +
    (record.component === undefined ? 0 : countComponents(record.component)) +
    (record.accessory === undefined ? 0 : countComponents(record.accessory))
  );
}
