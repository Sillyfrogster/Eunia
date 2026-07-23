import type * as types from "@eunia/types";
import type { DispatchHandlerMap } from "./types";

export const applicationHandlers: DispatchHandlerMap = {
  AUTO_MODERATION_RULE_CREATE(client, _ctx, data) {
    client.emit("autoModerationRuleCreate", data as types.AutoModerationRule);
  },

  AUTO_MODERATION_RULE_UPDATE(client, _ctx, data) {
    client.emit("autoModerationRuleUpdate", data as types.AutoModerationRule);
  },

  AUTO_MODERATION_RULE_DELETE(client, _ctx, data) {
    client.emit("autoModerationRuleDelete", data as types.AutoModerationRule);
  },

  AUTO_MODERATION_ACTION_EXECUTION(client, _ctx, data) {
    client.emit(
      "autoModerationActionExecution",
      data as types.AutoModerationActionExecutionEvent,
    );
  },

  ENTITLEMENT_CREATE(client, _ctx, data) {
    client.emit("entitlementCreate", data as types.Entitlement);
  },

  ENTITLEMENT_UPDATE(client, _ctx, data) {
    client.emit("entitlementUpdate", data as types.Entitlement);
  },

  ENTITLEMENT_DELETE(client, _ctx, data) {
    client.emit("entitlementDelete", data as types.Entitlement);
  },

  SUBSCRIPTION_CREATE(client, _ctx, data) {
    client.emit("subscriptionCreate", data as types.Subscription);
  },

  SUBSCRIPTION_UPDATE(client, _ctx, data) {
    client.emit("subscriptionUpdate", data as types.Subscription);
  },

  SUBSCRIPTION_DELETE(client, _ctx, data) {
    client.emit("subscriptionDelete", data as types.Subscription);
  },
};
