import { PermissionFlags } from "@eunia/types";

/** Every permission flag combined; what owners and administrators hold. */
export const ALL_PERMISSION_BITS: bigint = Object.values(PermissionFlags).reduce(
  (bits, flag) => bits | flag,
  0n,
);
