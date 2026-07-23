import { MiddlewareError } from "./errors";
import type {
  CommandContext,
  CommandMiddleware,
} from "./types";

export async function runMiddleware(
  middleware: readonly CommandMiddleware[],
  context: CommandContext,
  execute: () => Promise<void> | void,
): Promise<void> {
  const dispatch = async (index: number): Promise<void> => {
    const current = middleware[index];
    if (current === undefined) {
      await execute();
      return;
    }

    let active = true;
    let called = false;
    let continuation: ObservedNext | undefined;
    try {
      await current(context, () => {
        if (!active) {
          throw new MiddlewareError(
            "Command middleware called next after it returned.",
          );
        }
        if (called) throw new MiddlewareError();
        called = true;
        continuation = new ObservedNext(dispatch(index + 1));
        return continuation;
      });
      await continuation?.finish();
    } finally {
      active = false;
    }
  };

  await dispatch(0);
}

class ObservedNext implements Promise<void> {
  readonly [Symbol.toStringTag] = "Promise";
  private wasObserved = false;

  constructor(private readonly promise: Promise<void>) {
    void promise.catch(() => undefined);
  }

  get observed(): boolean {
    return this.wasObserved;
  }

  async finish(): Promise<void> {
    if (this.wasObserved) {
      await this.promise.catch(() => undefined);
      return;
    }
    await this.promise;
  }

  then<TResult1 = void, TResult2 = never>(
    onfulfilled?: ((value: void) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): Promise<TResult1 | TResult2> {
    this.wasObserved = true;
    return this.promise.then(onfulfilled, onrejected);
  }

  catch<TResult = never>(
    onrejected?: ((reason: unknown) => TResult | PromiseLike<TResult>) | null,
  ): Promise<void | TResult> {
    this.wasObserved = true;
    return this.promise.catch(onrejected);
  }

  finally(onfinally?: (() => void) | null): Promise<void> {
    this.wasObserved = true;
    return this.promise.finally(onfinally);
  }
}
