import type {
  Localizations,
  PermissionInput,
} from "@eunia/types";
import type {
  CommandAccess,
  CommandChoice,
} from "./types";

export function freezeAccess(access: CommandAccess): CommandAccess {
  return Object.freeze({
    ...access,
    ...(access.userPermissions === undefined
      ? {}
      : {
          userPermissions: freezePermissionInput(
            access.userPermissions,
          ),
        }),
    ...(access.botPermissions === undefined
      ? {}
      : {
          botPermissions: freezePermissionInput(
            access.botPermissions,
          ),
        }),
    ...(access.guards === undefined
      ? {}
      : { guards: Object.freeze([...access.guards]) }),
  });
}

export function freezeChoices<T extends string | number>(
  choices: readonly CommandChoice<T>[],
): readonly CommandChoice<T>[] {
  return Object.freeze(
    choices.map((choice) =>
      Object.freeze({
        ...choice,
        ...(choice.nameLocalizations === undefined
          ? {}
          : {
              nameLocalizations: freezeLocalizations(
                choice.nameLocalizations,
              ),
            }),
      }),
    ),
  );
}

export function freezeLocalizations(
  localizations: Localizations,
): Localizations {
  if (
    typeof localizations !== "object" ||
    localizations === null ||
    Array.isArray(localizations)
  ) {
    return localizations;
  }
  return Object.freeze({ ...localizations });
}

export function freezePermissionInput(
  permissions: PermissionInput,
): PermissionInput {
  return Array.isArray(permissions)
    ? Object.freeze([...permissions])
    : permissions;
}
