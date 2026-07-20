export interface AuditLogOptions {
  reason?: string;
}

export function auditLogRequest(options: AuditLogOptions): AuditLogOptions {
  return options.reason === undefined ? {} : { reason: options.reason };
}

export function checkedDeleteMessageSeconds(value: number | undefined): number | undefined {
  if (
    value !== undefined &&
    (!Number.isInteger(value) || value < 0 || value > 604_800)
  ) {
    throw new RangeError("Deleted message history must be between 0 and 604800 seconds.");
  }
  return value;
}
