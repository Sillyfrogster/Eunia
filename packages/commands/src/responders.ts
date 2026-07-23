import { MessageFlags } from "@eunia/types";
import type * as types from "@eunia/types";
import {
  normalizeSendable,
  type Interaction,
  type Sendable,
} from "@eunia/structures";
import { ReplyVisibilityMismatchError } from "./errors";

export class AutocompleteResponder {
  readonly deadline: Promise<void>;
  readonly signal: AbortSignal;
  private claimed: boolean;
  private readonly controller = new AbortController();
  private readonly timer: ReturnType<typeof setTimeout>;
  private resolveDeadline!: () => void;
  private timeoutTask?: Promise<void>;

  constructor(
    private readonly interaction: Interaction<"autocomplete">,
    timeoutMs: number,
    private readonly onTimeoutError: (error: unknown) => Promise<void>,
  ) {
    this.claimed = interaction.acknowledged;
    this.signal = this.controller.signal;
    this.deadline = new Promise((resolve) => {
      this.resolveDeadline = resolve;
    });
    this.timer = setTimeout(() => {
      this.controller.abort();
      this.timeoutTask = this.send([]).then(
        () => undefined,
        async (error: unknown) => {
          await this.onTimeoutError(error);
        },
      );
      void this.timeoutTask.then(
        this.resolveDeadline,
        this.resolveDeadline,
      );
    }, timeoutMs);
  }

  async send(
    choices: readonly types.ApplicationCommandChoice[],
  ): Promise<boolean> {
    if (this.claimed) return false;
    this.claimed = true;
    try {
      await this.interaction.autocomplete(choices);
      return true;
    } catch (error) {
      this.claimed = this.interaction.acknowledged;
      throw error;
    }
  }

  async sendEmpty(): Promise<void> {
    try {
      await this.send([]);
    } catch {
      return;
    }
  }

  async close(): Promise<void> {
    clearTimeout(this.timer);
    if (this.timeoutTask !== undefined) await this.timeoutTask;
  }
}

type RespondingInteraction = Interaction<
  "command" | "button" | "select" | "modal"
>;

export class InteractionResponder {
  private state: "idle" | "deferred" | "replied";
  private deferredEphemeral = false;
  private deferredResponse: "message" | "update" = "message";
  private tail: Promise<void> = Promise.resolve();

  constructor(private readonly interaction: RespondingInteraction) {
    this.state =
      interaction.state === "deferred"
        ? "deferred"
        : interaction.state === "pending"
          ? "idle"
          : "replied";
  }

  reply(response: Sendable): Promise<unknown> {
    return this.enqueue(() => this.send(response, false));
  }

  privateReply(response: Sendable): Promise<unknown> {
    return this.enqueue(() => this.send(response, true));
  }

  defer(options?: { readonly ephemeral?: boolean }): Promise<boolean> {
    return this.enqueue(() => this.performDefer(options));
  }

  modal(input: types.ModalInteractionResponseData): Promise<void> {
    return this.enqueue(() => this.performModal(input));
  }

  update(response: Sendable): Promise<void> {
    return this.enqueue(() => this.performUpdate(response));
  }

  private async performDefer(
    options?: { readonly ephemeral?: boolean },
  ): Promise<boolean> {
    if (this.syncFromInteraction() === "in_flight") return false;
    if (this.state !== "idle") return false;

    try {
      await this.interaction.defer(options);
      this.readDeferredState();
      return true;
    } catch (error) {
      this.syncFromInteraction();
      throw error;
    }
  }

  private async send(
    response: Sendable,
    replaceVisibility: boolean,
  ): Promise<unknown> {
    if (this.syncFromInteraction() === "in_flight") {
      throw new Error("An interaction response is still in progress.");
    }

    if (this.state === "deferred") {
      if (this.deferredResponse === "update") {
        return this.interaction.followup(response);
      }
      const requestedEphemeral = ephemeralOf(response);
      const visibilityChanged =
        requestedEphemeral !== undefined &&
        requestedEphemeral !== this.deferredEphemeral;
      if (visibilityChanged && !replaceVisibility) {
        throw new ReplyVisibilityMismatchError();
      }
      if (visibilityChanged) {
        await this.interaction.original.delete();
        this.state = "replied";
        return this.interaction.followup(response);
      }
      const result = await this.interaction.original.edit(
        stripEphemeralFlag(response),
      );
      this.state = "replied";
      return result;
    }
    if (this.state === "replied") return this.interaction.followup(response);

    try {
      await this.interaction.respond(response);
      this.state = "replied";
      return undefined;
    } catch (error) {
      this.syncFromInteraction();
      throw error;
    }
  }

  private async performUpdate(response: Sendable): Promise<void> {
    if (this.interaction.kind === "command") {
      throw new TypeError(
        "A command interaction cannot update a component message.",
      );
    }
    if (this.syncFromInteraction() === "in_flight") {
      throw new Error("An interaction response is still in progress.");
    }
    if (this.state === "deferred" || this.state === "replied") {
      await this.interaction.original.edit(response);
      this.state = "replied";
      return;
    }

    try {
      await this.interaction.update(response);
      this.state = "replied";
    } catch (error) {
      this.syncFromInteraction();
      throw error;
    }
  }

  private async performModal(
    input: types.ModalInteractionResponseData,
  ): Promise<void> {
    if (this.interaction.kind === "modal") {
      throw new TypeError(
        "A modal submission cannot open another modal.",
      );
    }
    if (this.syncFromInteraction() === "in_flight") {
      throw new Error("An interaction response is still in progress.");
    }
    if (this.state !== "idle") {
      throw new Error("A modal must be the initial interaction response.");
    }

    try {
      await this.interaction.modal(input);
      this.state = "replied";
    } catch (error) {
      this.syncFromInteraction();
      throw error;
    }
  }

  private syncFromInteraction(): "ready" | "in_flight" {
    switch (this.interaction.state) {
      case "pending":
        this.state = "idle";
        return "ready";
      case "replied":
        this.state = "replied";
        return "ready";
      case "deferred":
        this.readDeferredState();
        return "ready";
      case "autocomplete":
        this.state = "replied";
        return "ready";
      case "replying":
      case "deferring":
      case "autocompleting":
      case "uncertain":
        return "in_flight";
    }
  }

  private readDeferredState(): void {
    this.state = "deferred";
    this.deferredEphemeral =
      this.interaction.deferredEphemeral ?? false;
    this.deferredResponse =
      this.interaction.deferredResponse ?? "message";
  }

  private enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const pending = this.tail.then(operation, operation);
    this.tail = pending.then(
      () => undefined,
      () => undefined,
    );
    return pending;
  }
}

export function stripEphemeralFlag(response: Sendable): Sendable {
  if (typeof response === "string" || Array.isArray(response)) return response;
  const flags = (response as { flags?: unknown }).flags;
  if (
    typeof flags !== "number" ||
    (flags & MessageFlags.Ephemeral) === 0
  ) {
    return response;
  }
  const payload = normalizeSendable(response);
  return { ...payload, flags: flags & ~MessageFlags.Ephemeral };
}

function ephemeralOf(response: Sendable): boolean | undefined {
  if (typeof response === "string" || Array.isArray(response)) return undefined;
  const flags = (response as { flags?: unknown }).flags;
  if (typeof flags !== "number") return undefined;
  return (flags & MessageFlags.Ephemeral) !== 0;
}
