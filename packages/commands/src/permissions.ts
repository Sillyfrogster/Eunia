import {
  PermissionFlags,
  type PermissionInput,
} from "@eunia/types";
import { CommandValidationError } from "./errors";

export function resolvePermissionBits(value: PermissionInput): bigint {
  try {
    if (Array.isArray(value)) {
      return value.reduce<bigint>((bits, permission) => {
        if (typeof permission !== "bigint") {
          throw new TypeError();
        }
        return bits | permission;
      }, 0n);
    }
    if (typeof value !== "bigint" && typeof value !== "string") {
      throw new TypeError();
    }
    return BigInt(value as bigint | string);
  } catch {
    throw new CommandValidationError(
      "Permission values must be valid bitfields.",
    );
  }
}

export function hasPermissions(actual: bigint, required: bigint): boolean {
  return (
    (actual & PermissionFlags.Administrator) ===
      PermissionFlags.Administrator ||
    (actual & required) === required
  );
}
