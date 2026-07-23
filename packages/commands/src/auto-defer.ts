import { CommandExecutionError } from "./errors";
import type { InteractionResponder } from "./responders";
import type {
  AutoDeferOptions,
  CommandAccessContext,
} from "./types";

export interface AutoDeferHandle {
  timer?: ReturnType<typeof setTimeout>;
  completion?: Promise<void>;
}

interface AutoDeferInput {
  readonly configured: boolean | AutoDeferOptions | undefined;
  readonly responder: InteractionResponder;
  readonly path: readonly string[];
  readonly report: (
    error: CommandExecutionError,
    context?: CommandAccessContext,
  ) => Promise<void>;
  readonly context?: () => CommandAccessContext | undefined;
}

export function startAutoDefer(
  input: AutoDeferInput,
): AutoDeferHandle | undefined {
  if (input.configured === undefined || input.configured === false) {
    return undefined;
  }

  const settings =
    typeof input.configured === "boolean" ? {} : input.configured;
  const handle: AutoDeferHandle = {};
  handle.timer = setTimeout(() => {
    handle.completion = input.responder
      .defer(
        settings.ephemeral === undefined
          ? undefined
          : { ephemeral: settings.ephemeral },
      )
      .then(
        () => undefined,
        async (error: unknown) => {
          await input.report(
            new CommandExecutionError(input.path, error),
            input.context?.(),
          );
        },
      );
  }, settings.afterMs ?? 2_000);
  return handle;
}

export async function finishAutoDefer(
  handle: AutoDeferHandle | undefined,
): Promise<void> {
  if (handle?.timer !== undefined) clearTimeout(handle.timer);
  if (handle?.completion !== undefined) await handle.completion;
}
