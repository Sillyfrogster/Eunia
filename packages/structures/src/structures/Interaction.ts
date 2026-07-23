/**
 * Interactions model Discord's two response mechanisms: exactly one initial
 * callback, then webhook operations against the acknowledged response.
 *
 * A state machine tracks which side of that line the interaction is on. The
 * public type is a union discriminated by `kind`, so verbs that a kind cannot
 * perform do not exist on its type.
 */
import { DiscordError, RateLimitExhaustedError, routePath } from "@eunia/rest";
import {
  ComponentType,
  InteractionCallbackType,
  InteractionType,
  MessageFlags,
} from "@eunia/types";
import type * as types from "@eunia/types";
import {
  setCachedGuild,
  upsertCachedGuildChannel,
  type StructureContext,
} from "../context";
import {
  normalizeSendable,
  splitMessageFiles,
  type Sendable,
} from "../utils/messages";
import { freezeSnapshot } from "./BaseStructure";
import { Channel } from "./Channel";
import { Guild } from "./Guild";
import { GuildMember } from "./GuildMember";
import { Message } from "./Message";
import { Role } from "./Role";
import { User } from "./User";

export type InteractionKind =
  | "command"
  | "autocomplete"
  | "button"
  | "select"
  | "modal";

export type InteractionState =
  | "pending"
  | "replying"
  | "deferring"
  | "autocompleting"
  | "replied"
  | "deferred"
  | "autocomplete"
  | "uncertain";

export interface DeferOptions {
  ephemeral?: boolean;
}

export type ModalFieldValue = string | readonly string[] | boolean | null;

export class InteractionAlreadyAcknowledgedError extends Error {
  constructor(readonly state: InteractionState) {
    super(`This interaction already has an initial response (${state}).`);
    this.name = "InteractionAlreadyAcknowledgedError";
  }
}

export class InteractionNotAcknowledgedError extends Error {
  constructor(readonly state: InteractionState) {
    super(`This interaction has no completed initial response (${state}).`);
    this.name = "InteractionNotAcknowledgedError";
  }
}

/** Handle on the @original response message. */
export interface OriginalMessage {
  get(): Promise<Message>;
  edit(input: Sendable): Promise<Message>;
  delete(): Promise<void>;
}

interface InteractionCommon {
  readonly raw: Readonly<types.Interaction>;
  readonly id: string;
  readonly kind: InteractionKind;
  readonly applicationId: string;
  readonly token: string;
  readonly guildId: string | undefined;
  readonly channelId: string | undefined;
  readonly state: InteractionState;
  readonly acknowledged: boolean;
  readonly deferredEphemeral: boolean | undefined;
  readonly deferredResponse: "message" | "update" | undefined;
  readonly user: User | undefined;
  readonly member: GuildMember | undefined;
  readonly channel: Channel | undefined;
  readonly guild: Guild | undefined;
  fetchChannel(): Promise<Channel | undefined>;
  fetchGuild(): Promise<Guild | undefined>;
  resolvedUser(id: string): User | undefined;
  resolvedChannel(id: string): Channel | undefined;
  resolvedRole(id: string): Role | undefined;
  resolvedMessage(id: string): Message | undefined;
  toJSON(): types.Interaction;
}

interface RespondingInteraction extends InteractionCommon {
  /** Sends the initial message response. */
  respond(input: Sendable): Promise<void>;
  /** Acknowledges now, answers later; picks the deferred mode from the kind. */
  defer(options?: DeferOptions): Promise<void>;
  /** The @original response message handle. */
  readonly original: OriginalMessage;
  /** Sends an additional message after acknowledgement. */
  followup(input: Sendable): Promise<Message>;
}

export interface CommandInteractionShape extends RespondingInteraction {
  readonly kind: "command";
  readonly commandName: string;
  /** Opens a modal as the initial response. */
  modal(input: types.ModalInteractionResponseData): Promise<void>;
}

export interface AutocompleteInteractionShape extends InteractionCommon {
  readonly kind: "autocomplete";
  readonly commandName: string;
  /** Sends the suggestion list; the only valid response for this kind. */
  autocomplete(choices: readonly types.ApplicationCommandChoice[]): Promise<void>;
}

export interface ButtonInteractionShape extends RespondingInteraction {
  readonly kind: "button";
  readonly customId: string;
  readonly message: Message | undefined;
  /** Edits the message the component sits on, as the initial response. */
  update(input: Sendable): Promise<void>;
  modal(input: types.ModalInteractionResponseData): Promise<void>;
}

export interface SelectInteractionShape extends RespondingInteraction {
  readonly kind: "select";
  readonly customId: string;
  readonly message: Message | undefined;
  readonly values: readonly string[];
  update(input: Sendable): Promise<void>;
  modal(input: types.ModalInteractionResponseData): Promise<void>;
}

export interface ModalInteractionShape extends RespondingInteraction {
  readonly kind: "modal";
  readonly customId: string;
  readonly message: Message | undefined;
  update(input: Sendable): Promise<void>;
  /** Reads one submitted field by custom id. */
  field(customId: string): ModalFieldValue | undefined;
  /** Reads one submitted text input by custom id. */
  textField(customId: string): string | undefined;
}

type InteractionShapes =
  | CommandInteractionShape
  | AutocompleteInteractionShape
  | ButtonInteractionShape
  | SelectInteractionShape
  | ModalInteractionShape;

/**
 * A received interaction, narrowed through the `kind` discriminant:
 * `if (interaction.kind === "button")` exposes button-only members.
 */
export type Interaction<K extends InteractionKind = InteractionKind> = Extract<
  InteractionShapes,
  { kind: K }
>;

/** Hydrates a raw interaction payload into its kind-narrowed form. */
export function createInteraction(
  raw: types.ApplicationCommandInteraction,
  ctx: StructureContext,
): Interaction<"command">;
export function createInteraction(
  raw: types.AutocompleteInteraction,
  ctx: StructureContext,
): Interaction<"autocomplete">;
export function createInteraction(
  raw: types.MessageComponentInteraction,
  ctx: StructureContext,
): Interaction<"button" | "select">;
export function createInteraction(
  raw: types.ModalSubmitInteraction,
  ctx: StructureContext,
): Interaction<"modal">;
export function createInteraction(
  raw: types.Interaction,
  ctx: StructureContext,
): Interaction;
export function createInteraction(
  raw: types.Interaction,
  ctx: StructureContext,
): Interaction {
  return new InteractionImpl(raw, ctx) as unknown as Interaction;
}

/** Returns true when the value is an interaction produced by createInteraction. */
export function isInteraction(value: unknown): value is Interaction {
  return value instanceof InteractionImpl;
}

function kindOf(raw: types.Interaction): InteractionKind {
  switch (raw.type) {
    case InteractionType.ApplicationCommand:
      return "command";
    case InteractionType.ApplicationCommandAutocomplete:
      return "autocomplete";
    case InteractionType.MessageComponent:
      return raw.data !== undefined &&
        "component_type" in raw.data &&
        raw.data.component_type === ComponentType.Button
        ? "button"
        : "select";
    case InteractionType.ModalSubmit:
      return "modal";
    default:
      throw new TypeError(`Unsupported interaction type ${raw.type}.`);
  }
}

class InteractionImpl {
  readonly raw: Readonly<types.Interaction>;
  readonly kind: InteractionKind;
  private currentState: InteractionState = "pending";
  private currentDeferredEphemeral: boolean | undefined;
  private currentDeferredResponse: "message" | "update" | undefined;
  private originalHandle: OriginalMessage | undefined;

  constructor(
    raw: types.Interaction,
    private readonly ctx: StructureContext,
  ) {
    this.raw = freezeSnapshot(raw);
    this.kind = kindOf(raw);
  }

  get id(): string {
    return this.raw.id;
  }

  get applicationId(): string {
    return this.raw.application_id;
  }

  get token(): string {
    return this.raw.token;
  }

  get guildId(): string | undefined {
    return this.raw.guild_id;
  }

  get channelId(): string | undefined {
    return this.raw.channel_id;
  }

  get state(): InteractionState {
    return this.currentState;
  }

  get acknowledged(): boolean {
    return this.currentState !== "pending";
  }

  get deferredEphemeral(): boolean | undefined {
    return this.currentState === "deferred"
      ? this.currentDeferredEphemeral
      : undefined;
  }

  get deferredResponse(): "message" | "update" | undefined {
    return this.currentState === "deferred"
      ? this.currentDeferredResponse
      : undefined;
  }

  get commandName(): string | undefined {
    const data = this.raw.data;
    return data !== undefined && "name" in data ? data.name : undefined;
  }

  get customId(): string | undefined {
    const data = this.raw.data;
    return data !== undefined && "custom_id" in data ? data.custom_id : undefined;
  }

  get values(): readonly string[] {
    const data = this.raw.data;
    if (data === undefined || !("component_type" in data)) return [];
    return Object.freeze([...(data.values ?? [])]);
  }

  get message(): Message | undefined {
    return this.raw.message === undefined
      ? undefined
      : new Message(this.raw.message, this.ctx);
  }

  get user(): User | undefined {
    const raw = this.raw.member?.user ?? this.raw.user;
    return raw === undefined ? undefined : new User(raw, this.ctx);
  }

  get member(): GuildMember | undefined {
    const guildId = this.guildId;
    const raw = this.raw.member;
    const userId = raw?.user?.id ?? this.raw.user?.id;
    if (guildId === undefined || raw === undefined || userId === undefined) return undefined;
    return new GuildMember(raw, this.ctx, guildId, userId);
  }

  get channel(): Channel | undefined {
    const channelId = this.channelId;
    if (channelId === undefined) return undefined;
    const raw = this.ctx.cache.channels.resolve(channelId);
    return raw === undefined ? undefined : new Channel(raw, this.ctx);
  }

  get guild(): Guild | undefined {
    const guildId = this.guildId;
    if (guildId === undefined) return undefined;
    const raw = this.ctx.cache.guilds.resolve(guildId);
    return raw === undefined ? undefined : new Guild(raw, this.ctx);
  }

  get original(): OriginalMessage {
    this.originalHandle ??= {
      get: () => this.getOriginal(),
      edit: (input: Sendable) => this.editOriginal(input),
      delete: () => this.deleteOriginal(),
    };
    return this.originalHandle;
  }

  resolvedUser(id: string): User | undefined {
    const raw = this.resolvedData?.users?.[id];
    return raw === undefined ? undefined : new User(raw, this.ctx);
  }

  resolvedChannel(id: string): Channel | undefined {
    const raw = this.resolvedData?.channels?.[id];
    return raw === undefined ? undefined : new Channel(raw, this.ctx);
  }

  resolvedRole(id: string): Role | undefined {
    const guildId = this.guildId;
    if (guildId === undefined) return undefined;
    const raw = this.resolvedData?.roles?.[id];
    return raw === undefined ? undefined : new Role(raw, this.ctx, guildId);
  }

  resolvedMessage(id: string): Message | undefined {
    const raw = this.resolvedData?.messages?.[id];
    if (!isCompleteMessage(raw)) return undefined;
    this.cacheMessage(raw);
    return new Message(raw, this.ctx);
  }

  private get resolvedData(): types.ResolvedData | undefined {
    const data = this.raw.data;
    return data !== undefined && "resolved" in data ? data.resolved : undefined;
  }

  async fetchChannel(): Promise<Channel | undefined> {
    const channelId = this.channelId;
    if (channelId === undefined) return undefined;
    const cached = await this.ctx.cache.channels.get(channelId);
    if (cached !== undefined) return new Channel(cached, this.ctx);
    const raw = await this.ctx.rest.get<types.Channel>(
      routePath("/channels/{channelId}", { channelId }),
    );
    upsertCachedGuildChannel(this.ctx, raw);
    return new Channel(raw, this.ctx);
  }

  async fetchGuild(): Promise<Guild | undefined> {
    const guildId = this.guildId;
    if (guildId === undefined) return undefined;
    const cached = await this.ctx.cache.guilds.get(guildId);
    if (cached !== undefined) return new Guild(cached, this.ctx);
    const raw = await this.ctx.rest.get<types.Guild>(
      routePath("/guilds/{guildId}", { guildId }),
    );
    setCachedGuild(this.ctx, raw);
    return new Guild(raw, this.ctx);
  }

  respond(input: Sendable): Promise<void> {
    this.requireKind("command", "button", "select", "modal");
    return this.initialResponse(
      "replying",
      "replied",
      InteractionCallbackType.ChannelMessageWithSource,
      normalizeSendable(input),
    );
  }

  defer(options: DeferOptions = {}): Promise<void> {
    this.requireKind("command", "button", "select", "modal");
    if (this.deferMode() === InteractionCallbackType.DeferredUpdateMessage) {
      if (options.ephemeral === true) {
        throw new RangeError(
          "A deferred message update cannot change response visibility.",
        );
      }
      return this.initialResponse(
        "deferring",
        "deferred",
        InteractionCallbackType.DeferredUpdateMessage,
      ).then(() => {
        this.currentDeferredEphemeral = false;
        this.currentDeferredResponse = "update";
      });
    }
    const data: types.InteractionResponseData | undefined = options.ephemeral
      ? { flags: MessageFlags.Ephemeral }
      : undefined;
    return this.initialResponse(
      "deferring",
      "deferred",
      InteractionCallbackType.DeferredChannelMessageWithSource,
      data,
    ).then(() => {
      this.currentDeferredEphemeral = options.ephemeral ?? false;
      this.currentDeferredResponse = "message";
    });
  }

  update(input: Sendable): Promise<void> {
    this.requireKind("button", "select", "modal");
    return this.initialResponse(
      "replying",
      "replied",
      InteractionCallbackType.UpdateMessage,
      normalizeSendable(input, "edit"),
    );
  }

  modal(input: types.ModalInteractionResponseData): Promise<void> {
    this.requireKind("command", "button", "select");
    return this.initialResponse(
      "replying",
      "replied",
      InteractionCallbackType.Modal,
      structuredClone(input),
    );
  }

  autocomplete(choices: readonly types.ApplicationCommandChoice[]): Promise<void> {
    this.requireKind("autocomplete");
    return this.initialResponse(
      "autocompleting",
      "autocomplete",
      InteractionCallbackType.ApplicationCommandAutocompleteResult,
      { choices: [...choices] },
    );
  }

  async followup(input: Sendable): Promise<Message> {
    this.requireCompletedResponse();
    const request = splitMessageFiles(normalizeSendable(input));
    const raw = await this.ctx.rest.post<types.Message>(
      routePath("/webhooks/{webhookId}/{webhookToken}", {
        webhookId: this.applicationId,
        webhookToken: this.token,
      }),
      request.body,
      {
        auth: false,
        global: false,
        ...(request.files === undefined ? {} : { files: request.files }),
      },
    );
    this.cacheMessage(raw);
    return new Message(raw, this.ctx);
  }

  field(customId: string): ModalFieldValue | undefined {
    if (
      this.raw.type !== InteractionType.ModalSubmit ||
      this.raw.data === undefined ||
      !("components" in this.raw.data)
    ) {
      return undefined;
    }
    const values = new Map<string, ModalFieldValue>();
    collectModalValues(this.raw.data.components, values);
    return values.get(customId);
  }

  textField(customId: string): string | undefined {
    const value = this.field(customId);
    return typeof value === "string" ? value : undefined;
  }

  toJSON(): types.Interaction {
    return structuredClone(this.raw) as types.Interaction;
  }

  private async getOriginal(): Promise<Message> {
    this.requireCompletedResponse();
    const raw = await this.ctx.rest.get<types.Message>(
      this.originalRoute(),
      { auth: false, global: false },
    );
    this.cacheMessage(raw);
    return new Message(raw, this.ctx);
  }

  private async editOriginal(input: Sendable): Promise<Message> {
    this.requireCompletedResponse();
    const request = splitMessageFiles(normalizeSendable(input, "edit"));
    const raw = await this.ctx.rest.patch<types.Message>(
      this.originalRoute(),
      request.body,
      {
        auth: false,
        global: false,
        ...(request.files === undefined ? {} : { files: request.files }),
      },
    );
    this.cacheMessage(raw);
    this.currentState = "replied";
    return new Message(raw, this.ctx);
  }

  private async deleteOriginal(): Promise<void> {
    this.requireCompletedResponse();
    await this.ctx.rest.delete(this.originalRoute(), { auth: false, global: false });
  }

  private originalRoute() {
    return routePath("/webhooks/{webhookId}/{webhookToken}/messages/@original", {
      webhookId: this.applicationId,
      webhookToken: this.token,
    });
  }

  private deferMode(): InteractionCallbackType {
    if (this.kind === "button" || this.kind === "select") {
      return InteractionCallbackType.DeferredUpdateMessage;
    }
    if (this.kind === "modal" && this.raw.message !== undefined) {
      return InteractionCallbackType.DeferredUpdateMessage;
    }
    return InteractionCallbackType.DeferredChannelMessageWithSource;
  }

  private requireKind(...kinds: readonly InteractionKind[]): void {
    if (!kinds.includes(this.kind)) {
      throw new TypeError(`A ${this.kind} interaction cannot perform this response.`);
    }
  }

  private async initialResponse(
    inFlight: Extract<InteractionState, "replying" | "deferring" | "autocompleting">,
    completed: Extract<InteractionState, "replied" | "deferred" | "autocomplete">,
    type: InteractionCallbackType,
    data?: object,
  ): Promise<void> {
    if (this.currentState !== "pending") {
      throw new InteractionAlreadyAcknowledgedError(this.currentState);
    }
    this.currentState = inFlight;
    try {
      const request = splitMessageFiles(
        (data ?? {}) as { files?: types.MessageCreate["files"] },
      );
      await this.ctx.rest.post(
        routePath("/interactions/{interactionId}/{interactionToken}/callback", {
          interactionId: this.id,
          interactionToken: this.token,
        }),
        data === undefined ? { type } : { type, data: request.body },
        {
          auth: false,
          global: false,
          ...(request.files === undefined ? {} : { files: request.files }),
        },
      );
      this.currentState = completed;
    } catch (error) {
      this.currentState = isDefinitiveInitialResponseRejection(error)
        ? "pending"
        : "uncertain";
      throw error;
    }
  }

  private requireCompletedResponse(): void {
    if (this.currentState !== "replied" && this.currentState !== "deferred") {
      throw new InteractionNotAcknowledgedError(this.currentState);
    }
  }

  private cacheMessage(raw: types.Message): void {
    this.ctx.cache.messages.set(raw.id, raw);
    this.ctx.cache.users.set(raw.author.id, raw.author);
  }
}

function isDefinitiveInitialResponseRejection(error: unknown): boolean {
  if (error instanceof RateLimitExhaustedError) return true;
  return (
    error instanceof DiscordError &&
    error.status >= 400 &&
    error.status < 500 &&
    error.status !== 408 &&
    error.code !== 40_060
  );
}

function isCompleteMessage(raw: Partial<types.Message> | undefined): raw is types.Message {
  return (
    raw !== undefined &&
    typeof raw.id === "string" &&
    typeof raw.channel_id === "string" &&
    raw.author !== undefined &&
    typeof raw.author.id === "string" &&
    typeof raw.content === "string" &&
    typeof raw.timestamp === "string" &&
    (raw.edited_timestamp === null || typeof raw.edited_timestamp === "string") &&
    typeof raw.tts === "boolean" &&
    typeof raw.mention_everyone === "boolean" &&
    Array.isArray(raw.mentions) &&
    Array.isArray(raw.mention_roles) &&
    Array.isArray(raw.attachments) &&
    Array.isArray(raw.embeds) &&
    typeof raw.pinned === "boolean" &&
    typeof raw.type === "number"
  );
}

function collectModalValues(
  components: readonly types.ModalSubmitComponent[],
  values: Map<string, ModalFieldValue>,
): void {
  for (const component of components) {
    if (component.type === ComponentType.ActionRow) {
      collectModalChildren(component.components, values);
    } else if (component.type === ComponentType.Label) {
      collectModalChildren([component.component], values);
    }
  }
}

function collectModalChildren(
  components: readonly (
    | Extract<types.ModalSubmitComponent, { type: ComponentType.ActionRow }>["components"][number]
    | Extract<types.ModalSubmitComponent, { type: ComponentType.Label }>["component"]
  )[],
  values: Map<string, ModalFieldValue>,
): void {
  for (const component of components) {
    switch (component.type) {
      case ComponentType.TextInput:
        values.set(component.custom_id, component.value);
        break;
      case ComponentType.StringSelect:
      case ComponentType.UserSelect:
      case ComponentType.RoleSelect:
      case ComponentType.MentionableSelect:
      case ComponentType.ChannelSelect:
      case ComponentType.FileUpload:
      case ComponentType.CheckboxGroup:
        values.set(component.custom_id, Object.freeze([...component.values]));
        break;
      case ComponentType.RadioGroup:
        values.set(component.custom_id, component.value);
        break;
      case ComponentType.Checkbox:
        values.set(component.custom_id, component.value);
        break;
    }
  }
}
