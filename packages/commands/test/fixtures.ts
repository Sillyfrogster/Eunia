import {
  ApplicationCommandType,
  ComponentType,
  InteractionType,
  PermissionFlags,
  TextInputStyle,
} from "@eunia/types";
import type * as types from "@eunia/types";
import type { RequestPath } from "../../rest/src";
import { Cache } from "../../cache/src";
import {
  Message,
  createInteraction,
  type Interaction,
  type StructureCacheShape,
  type StructureContext,
} from "../../structures/src";
import type {
  CommandErrorContext,
  CommandHost,
} from "../src";

export const APPLICATION_ID = "10000000000000000";
export const BOT_ID = "20000000000000000";
export const OWNER_ID = "30000000000000000";
export const TARGET_USER_ID = "40000000000000000";
export const TARGET_MESSAGE_ID = "50000000000000000";
export const CHANNEL_ID = "60000000000000000";
export const GUILD_ID = "70000000000000000";

export const EDIT_MODAL_INPUT = {
  title: "Edit profile",
  components: [
    {
      type: ComponentType.ActionRow,
      components: [
        {
          type: ComponentType.TextInput,
          custom_id: "display-name",
          label: "Display name",
          style: TextInputStyle.Short,
        },
      ],
    },
  ],
} as const satisfies Omit<types.ModalInteractionResponseData, "custom_id">;

export function editModal(
  customId: string,
): types.ModalInteractionResponseData {
  return { ...EDIT_MODAL_INPUT, custom_id: customId };
}

export interface RestCall {
  readonly method: string;
  readonly path: string;
  readonly body?: unknown;
}

export class FakeRest {
  readonly calls: RestCall[] = [];

  get<T>(path: RequestPath): Promise<T> {
    return this.request("GET", path);
  }

  post<T>(path: RequestPath, body?: unknown): Promise<T> {
    return this.request("POST", path, body);
  }

  patch<T>(path: RequestPath, body?: unknown): Promise<T> {
    return this.request("PATCH", path, body);
  }

  put<T>(path: RequestPath, body?: unknown): Promise<T> {
    return this.request("PUT", path, body);
  }

  delete<T>(path: RequestPath): Promise<T> {
    return this.request("DELETE", path);
  }

  private async request<T>(
    method: string,
    path: RequestPath,
    body?: unknown,
  ): Promise<T> {
    const raw = typeof path === "string" ? path : path.path;
    this.calls.push({
      method,
      path: raw,
      ...(body === undefined ? {} : { body }),
    });
    if (raw.includes("/callback") || method === "DELETE") {
      return undefined as T;
    }
    if (raw.startsWith("/webhooks/") || raw.includes("/messages")) {
      return rawMessage("response") as T;
    }
    return undefined as T;
  }
}

export function verbs(rest: FakeRest): string[] {
  return rest.calls.map((call) => {
    if (call.path.includes("/callback")) {
      const type = (call.body as { type: number }).type;
      switch (type) {
        case 4:
          return "respond";
        case 5:
          return "defer";
        case 6:
          return "deferUpdate";
        case 7:
          return "update";
        case 8:
          return "autocomplete";
        case 9:
          return "modal";
        default:
          return "callback";
      }
    }
    if (call.path.endsWith("/messages/@original")) {
      if (call.method === "PATCH") return "editOriginal";
      if (call.method === "DELETE") return "deleteOriginal";
      return "getOriginal";
    }
    if (call.path.startsWith("/webhooks/")) return "followup";
    if (call.path.includes("/messages")) return "messageReply";
    return `${call.method} ${call.path}`;
  });
}

export function callbackData(rest: FakeRest, index = 0): unknown {
  return (rest.calls[index]?.body as { data?: unknown } | undefined)?.data;
}

export function makeContext(): {
  readonly ctx: StructureContext;
  readonly rest: FakeRest;
} {
  const rest = new FakeRest();
  return {
    rest,
    ctx: {
      rest: rest as unknown as StructureContext["rest"],
      cache: new Cache<StructureCacheShape>(),
    },
  };
}

export function makeHost(): CommandHost & {
  readonly requests: Array<{ path: string; body: unknown }>;
  readonly errors: unknown[];
  readonly errorContexts: Array<CommandErrorContext | undefined>;
} {
  const requests: Array<{ path: string; body: unknown }> = [];
  const errors: unknown[] = [];
  const errorContexts: Array<CommandErrorContext | undefined> = [];
  return {
    applicationId: APPLICATION_ID,
    botId: BOT_ID,
    ownerIds: [OWNER_ID],
    requests,
    errors,
    errorContexts,
    rest: {
      async put<T>(path: string, body?: unknown): Promise<T> {
        requests.push({ path, body });
        return body as T;
      },
    },
    reportCommandError(error, context): void {
      errors.push(error);
      errorContexts.push(context);
    },
  };
}

export function rawUser(
  id = OWNER_ID,
  username = "owner",
): types.User {
  return {
    id,
    username,
    discriminator: "0",
    global_name: null,
    avatar: null,
  };
}

export function rawMessage(
  content: string,
  authorId = OWNER_ID,
): types.Message {
  return {
    id: TARGET_MESSAGE_ID,
    channel_id: CHANNEL_ID,
    guild_id: GUILD_ID,
    author: rawUser(authorId),
    content,
    timestamp: "2026-01-01T00:00:00.000Z",
    edited_timestamp: null,
    tts: false,
    mention_everyone: false,
    mentions: [],
    mention_roles: [],
    attachments: [],
    embeds: [],
    pinned: false,
    type: 0,
  };
}

function interactionBase(
  userId = OWNER_ID,
  userPermissions = PermissionFlags.Administrator,
  botPermissions = PermissionFlags.Administrator,
) {
  return {
    id: "80000000000000000",
    application_id: APPLICATION_ID,
    channel_id: CHANNEL_ID,
    guild_id: GUILD_ID,
    member: {
      user: rawUser(userId),
      roles: [],
      joined_at: "2026-01-01T00:00:00.000Z",
      deaf: false,
      mute: false,
      flags: 0,
      permissions: `${userPermissions}` as `${bigint}`,
    },
    app_permissions: `${botPermissions}` as `${bigint}`,
    token: "token",
    version: 1 as const,
    entitlements: [],
    authorizing_integration_owners: {},
    attachment_size_limit: 10_000_000,
  };
}

export function slash(
  name: string,
  options: readonly types.ApplicationCommandInteractionOption[] = [],
  resolved?: types.ResolvedData,
  userId = OWNER_ID,
): { readonly source: Interaction; readonly rest: FakeRest } {
  const { ctx, rest } = makeContext();
  const source = createInteraction(
    {
      ...interactionBase(userId),
      type: InteractionType.ApplicationCommand,
      data: {
        id: "90000000000000000",
        name,
        type: ApplicationCommandType.ChatInput,
        options: [...options],
        ...(resolved === undefined ? {} : { resolved }),
      },
    },
    ctx,
  );
  return { source, rest };
}

export function autocompletion(
  name: string,
  options: readonly types.ApplicationCommandInteractionOption[],
): { readonly source: Interaction; readonly rest: FakeRest } {
  const { ctx, rest } = makeContext();
  const source = createInteraction(
    {
      ...interactionBase(),
      type: InteractionType.ApplicationCommandAutocomplete,
      data: {
        id: "90000000000000000",
        name,
        type: ApplicationCommandType.ChatInput,
        options: [...options],
      },
    },
    ctx,
  );
  return { source, rest };
}

export function component(
  customId: string,
  userId = OWNER_ID,
  userPermissions = PermissionFlags.Administrator,
  botPermissions = PermissionFlags.Administrator,
): { readonly source: Interaction; readonly rest: FakeRest } {
  const { ctx, rest } = makeContext();
  const source = createInteraction(
    {
      ...interactionBase(userId, userPermissions, botPermissions),
      type: InteractionType.MessageComponent,
      data: {
        custom_id: customId,
        component_type: ComponentType.Button,
      },
      message: rawMessage("original"),
    },
    ctx,
  );
  return { source, rest };
}

export function message(
  content: string,
  authorId = OWNER_ID,
): { readonly source: Message; readonly rest: FakeRest } {
  const { ctx, rest } = makeContext();
  return {
    source: new Message(rawMessage(content, authorId), ctx),
    rest,
  };
}

export function contextInteraction(
  type: ApplicationCommandType.User | ApplicationCommandType.Message,
  name: string,
  targetId: string | undefined,
  resolved: types.ResolvedData | undefined,
): { readonly source: Interaction<"command">; readonly rest: FakeRest } {
  const { ctx, rest } = makeContext();
  const source = createInteraction(
    {
      ...interactionBase(),
      type: InteractionType.ApplicationCommand,
      data: {
        id: "90000000000000000",
        name,
        type,
        ...(targetId === undefined ? {} : { target_id: targetId }),
        ...(resolved === undefined ? {} : { resolved }),
      },
    },
    ctx,
  );
  return { source, rest };
}
