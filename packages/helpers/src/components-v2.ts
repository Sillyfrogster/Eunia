import { normalizeSendable } from "@eunia/structures";
import { ComponentType, MessageFlags } from "@eunia/types";
import type * as types from "@eunia/types";

export type ComponentsV2MessageOptions = Omit<
  types.MessageCreate,
  | "components"
  | "content"
  | "embeds"
  | "flags"
  | "poll"
  | "shared_client_theme"
  | "sticker_ids"
> & {
  flags?: number;
};

export type ComponentsV2TextOptions = Omit<
  types.TextDisplayComponent,
  "content" | "type"
>;

export type ComponentsV2ThumbnailOptions = Omit<
  types.ThumbnailComponent,
  "media" | "type"
>;

export type ComponentsV2SectionContent =
  | string
  | types.TextDisplayComponent
  | readonly (string | types.TextDisplayComponent)[];

export type ComponentsV2SectionOptions = Omit<
  types.SectionComponent,
  "accessory" | "components" | "type"
>;

export type ComponentsV2GalleryItem =
  | string
  | {
      url: string;
      description?: string | null;
      spoiler?: boolean;
    };

export type ComponentsV2GalleryOptions = Omit<
  types.MediaGalleryComponent,
  "items" | "type"
>;

export type ComponentsV2FileOptions = Omit<
  types.FileComponent,
  "file" | "name" | "size" | "type"
>;

export type ComponentsV2SeparatorOptions = Omit<types.SeparatorComponent, "type">;

export type ComponentsV2ContainerChild = types.ContainerComponent["components"][number];

export interface ComponentsV2ContainerOptions {
  id?: number;
  accentColor?: number | null;
  spoiler?: boolean;
}

export type ComponentsV2Select =
  | types.MessageStringSelectComponent
  | types.MessageAutoSelectComponent;

export type ComponentsV2RowChildren =
  | readonly types.ButtonComponent[]
  | readonly [ComponentsV2Select];

export type ComponentsV2RowOptions = Omit<
  types.MessageActionRowComponent,
  "components" | "type"
>;

export interface ComponentsV2Helpers {
  message(
    components: readonly types.MessageComponent[],
    options?: ComponentsV2MessageOptions,
  ): types.MessageCreate;
  text(content: string, options?: ComponentsV2TextOptions): types.TextDisplayComponent;
  thumbnail(
    url: string,
    options?: ComponentsV2ThumbnailOptions,
  ): types.ThumbnailComponent;
  section(
    content: ComponentsV2SectionContent,
    accessory: types.SectionComponent["accessory"],
    options?: ComponentsV2SectionOptions,
  ): types.SectionComponent;
  gallery(
    items: readonly ComponentsV2GalleryItem[],
    options?: ComponentsV2GalleryOptions,
  ): types.MediaGalleryComponent;
  file(filename: string, options?: ComponentsV2FileOptions): types.FileComponent;
  separator(options?: ComponentsV2SeparatorOptions): types.SeparatorComponent;
  container(
    components: readonly ComponentsV2ContainerChild[],
    options?: ComponentsV2ContainerOptions,
  ): types.ContainerComponent;
  row(
    components: ComponentsV2RowChildren,
    options?: ComponentsV2RowOptions,
  ): types.MessageActionRowComponent;
}

function message(
  components: readonly types.MessageComponent[],
  options: ComponentsV2MessageOptions = {},
): types.MessageCreate {
  return normalizeSendable({
    ...options,
    components: [...components],
    flags: (options.flags ?? 0) | MessageFlags.IsComponentsV2,
  });
}

function text(
  content: string,
  options: ComponentsV2TextOptions = {},
): types.TextDisplayComponent {
  requireText(content, "Text display content");
  if ([...content].length > 4_000) {
    throw new RangeError("Text displays cannot exceed 4000 characters.");
  }
  return { type: ComponentType.TextDisplay, content, ...options };
}

function thumbnail(
  url: string,
  options: ComponentsV2ThumbnailOptions = {},
): types.ThumbnailComponent {
  requireText(url, "Thumbnail URL");
  validateDescription(options.description);
  return { type: ComponentType.Thumbnail, media: { url }, ...options };
}

function section(
  content: ComponentsV2SectionContent,
  accessory: types.SectionComponent["accessory"],
  options: ComponentsV2SectionOptions = {},
): types.SectionComponent {
  const values = Array.isArray(content) ? content : [content];
  if (values.length < 1 || values.length > 3) {
    throw new RangeError("Sections need between one and three text displays.");
  }
  const components = values.map((value) =>
    typeof value === "string" ? text(value) : value,
  );
  return { type: ComponentType.Section, components, accessory, ...options };
}

function gallery(
  items: readonly ComponentsV2GalleryItem[],
  options: ComponentsV2GalleryOptions = {},
): types.MediaGalleryComponent {
  if (items.length < 1 || items.length > 10) {
    throw new RangeError("Media galleries need between one and ten items.");
  }
  return {
    type: ComponentType.MediaGallery,
    items: items.map((item) => {
      if (typeof item === "string") {
        requireText(item, "Gallery item URL");
        return { media: { url: item } };
      }
      requireText(item.url, "Gallery item URL");
      validateDescription(item.description);
      const { url, ...itemOptions } = item;
      return { media: { url }, ...itemOptions };
    }),
    ...options,
  };
}

function file(filename: string, options: ComponentsV2FileOptions = {}): types.FileComponent {
  const prefix = "attachment://";
  const name = filename.startsWith(prefix) ? filename.slice(prefix.length) : filename;
  requireText(name, "Filename");
  const url = filename.startsWith(prefix) ? filename : `${prefix}${filename}`;
  return { type: ComponentType.File, file: { url }, ...options };
}

function separator(
  options: ComponentsV2SeparatorOptions = {},
): types.SeparatorComponent {
  return { type: ComponentType.Separator, ...options };
}

function container(
  components: readonly ComponentsV2ContainerChild[],
  options: ComponentsV2ContainerOptions = {},
): types.ContainerComponent {
  if (
    options.accentColor !== undefined &&
    options.accentColor !== null &&
    (!Number.isInteger(options.accentColor) ||
      options.accentColor < 0 ||
      options.accentColor > 0xffffff)
  ) {
    throw new RangeError("Container accent colors must be RGB integers from 0x000000 to 0xffffff.");
  }
  const { accentColor, ...containerOptions } = options;
  return {
    type: ComponentType.Container,
    components: [...components],
    ...(accentColor !== undefined ? { accent_color: accentColor } : {}),
    ...containerOptions,
  };
}

function row(
  components: ComponentsV2RowChildren,
  options: ComponentsV2RowOptions = {},
): types.MessageActionRowComponent {
  const children = [...components];
  const buttonsOnly = children.every((component) => component.type === ComponentType.Button);
  if (buttonsOnly) {
    if (children.length < 1 || children.length > 5) {
      throw new RangeError("Action rows need between one and five buttons.");
    }
    return {
      type: ComponentType.ActionRow,
      components: children as types.ButtonComponent[],
      ...options,
    };
  }

  const select = children[0];
  if (children.length !== 1 || !isMessageSelect(select)) {
    throw new TypeError("Action rows need buttons or one select menu.");
  }
  return {
    type: ComponentType.ActionRow,
    components: [select],
    ...options,
  };
}

function isMessageSelect(
  value: ComponentsV2Select | types.ButtonComponent | undefined,
): value is ComponentsV2Select {
  return (
    value !== undefined &&
    (value.type === ComponentType.StringSelect ||
      value.type === ComponentType.UserSelect ||
      value.type === ComponentType.RoleSelect ||
      value.type === ComponentType.MentionableSelect ||
      value.type === ComponentType.ChannelSelect)
  );
}

function requireText(value: string, label: string): void {
  if (value.trim().length === 0) throw new TypeError(`${label} cannot be empty.`);
}

function validateDescription(value: string | null | undefined): void {
  if (value !== undefined && value !== null && [...value].length > 1_024) {
    throw new RangeError("Media descriptions cannot exceed 1024 characters.");
  }
}

export const componentsV2: ComponentsV2Helpers = Object.freeze({
  message,
  text,
  thumbnail,
  section,
  gallery,
  file,
  separator,
  container,
  row,
});
