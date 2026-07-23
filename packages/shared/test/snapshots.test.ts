import { describe, expect, test } from "bun:test";
import { adoptSnapshot, copySnapshot } from "../src/snapshots";

describe("copySnapshot", () => {
  test("isolates and freezes borrowed data", () => {
    const borrowed = {
      name: "before",
      nested: { values: ["first"] },
    };

    const snapshot = copySnapshot(borrowed);
    borrowed.name = "after";
    borrowed.nested.values.push("second");

    expect(snapshot).not.toBe(borrowed);
    expect(snapshot).toEqual({
      name: "before",
      nested: { values: ["first"] },
    });
    expect(Object.isFrozen(snapshot)).toBe(true);
    expect(Object.isFrozen(snapshot.nested)).toBe(true);
    expect(Object.isFrozen(snapshot.nested.values)).toBe(true);
  });

  test("does not trust an externally frozen root", () => {
    const nested = { value: "before" };
    const borrowed = Object.freeze({ nested });

    const snapshot = copySnapshot(borrowed);
    nested.value = "after";

    expect(snapshot).not.toBe(borrowed);
    expect(snapshot.nested.value).toBe("before");
    expect(Object.isFrozen(snapshot.nested)).toBe(true);
  });
});

describe("adoptSnapshot", () => {
  test("freezes owned data without copying it", () => {
    const nested = { values: ["first"] };
    const owned = { nested };

    const snapshot = adoptSnapshot(owned);

    expect(snapshot).toBe(owned);
    expect(snapshot.nested).toBe(nested);
    expect(Object.isFrozen(snapshot)).toBe(true);
    expect(Object.isFrozen(nested)).toBe(true);
    expect(Object.isFrozen(nested.values)).toBe(true);
  });

  test("tracks every object for later reuse", () => {
    const nested = { value: "kept" };
    const snapshot = adoptSnapshot({ nested });

    expect(copySnapshot(snapshot)).toBe(snapshot);
    expect(copySnapshot(nested)).toBe(nested);
  });

  test("finishes an externally frozen graph", () => {
    const nested = { value: "kept" };
    const root = Object.freeze({ nested });

    const snapshot = adoptSnapshot(root);

    expect(snapshot).toBe(root);
    expect(Object.isFrozen(nested)).toBe(true);
  });

  test("supports repeated and cyclic references", () => {
    interface Node {
      child?: Node;
      peer?: Node;
    }

    const root: Node = {};
    const child: Node = { peer: root };
    root.child = child;
    root.peer = child;

    const snapshot = copySnapshot(root);

    expect(snapshot.child).toBe(snapshot.peer);
    expect(snapshot.child?.peer).toBe(snapshot);
    expect(Object.isFrozen(snapshot.child)).toBe(true);
  });
});
