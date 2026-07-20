import type { Client, EuniaModule } from "@eunia/client";
import type * as types from "@eunia/types";
import {
  createRegistry,
  isRegistry,
  type TemplateMap,
  type TemplateRegistry,
} from "./templates";

export type { TemplateMap, TemplateRegistry } from "./templates";

export type EmbedTemplates = TemplateMap<types.Embed>;
export type ComponentTemplates = TemplateMap<types.MessageComponent>;
/** Modal templates omit custom_id; listener fields derive the wire id. */
export type ModalTemplatePayload = Omit<types.ModalInteractionResponseData, "custom_id"> & {
  custom_id?: string;
};
export type ModalTemplates = TemplateMap<ModalTemplatePayload>;

export type EmbedRegistry<T extends EmbedTemplates = EmbedTemplates> = TemplateRegistry<
  types.Embed,
  T
>;
export type ComponentRegistry<T extends ComponentTemplates = ComponentTemplates> =
  TemplateRegistry<types.MessageComponent, T>;
export type ModalRegistry<T extends ModalTemplates = ModalTemplates> = TemplateRegistry<
  ModalTemplatePayload,
  T
>;

/** Defines embed templates; keys are the template names. */
export function defineEmbeds<T extends EmbedTemplates>(templates: T): EmbedRegistry<T> {
  return createRegistry<types.Embed, T>("embed", templates);
}

/** Defines component templates; keys are the template names. */
export function defineComponents<T extends ComponentTemplates>(
  templates: T,
): ComponentRegistry<T> {
  return createRegistry<types.MessageComponent, T>("component", templates);
}

/** Defines modal templates; keys are the template names. */
export function defineModals<T extends ModalTemplates>(templates: T): ModalRegistry<T> {
  return createRegistry<ModalTemplatePayload, T>("modal", templates);
}

function templateModule(
  domain: "embeds" | "components" | "modals",
  registry: TemplateRegistry<object>,
): EuniaModule {
  return {
    name: `helpers:${domain}`,
    setup(client: Client) {
      if (domain in client && client[domain as keyof Client] !== undefined) {
        throw new Error(`The client already has ${domain} templates installed.`);
      }
      Object.defineProperty(client, domain, { value: registry, enumerable: true });
    },
  };
}

/** Wires an embed registry onto the client as `client.embeds(...)`. */
export function embedTemplates<T extends EmbedTemplates>(
  templates: T | EmbedRegistry<T>,
): EuniaModule {
  const registry = isRegistry(templates) ? templates : defineEmbeds(templates as T);
  return templateModule("embeds", registry as TemplateRegistry<object>);
}

/** Wires a component registry onto the client as `client.components(...)`. */
export function componentTemplates<T extends ComponentTemplates>(
  templates: T | ComponentRegistry<T>,
): EuniaModule {
  const registry = isRegistry(templates) ? templates : defineComponents(templates as T);
  return templateModule("components", registry as TemplateRegistry<object>);
}

/** Wires a modal registry onto the client as `client.modals(...)`. */
export function modalTemplates<T extends ModalTemplates>(
  templates: T | ModalRegistry<T>,
): EuniaModule {
  const registry = isRegistry(templates) ? templates : defineModals(templates as T);
  return templateModule("modals", registry as TemplateRegistry<object>);
}
