import { randomUUID } from "node:crypto";
import { config } from "../config.js";
import type { DeviceSummary } from "../schemas/device.schema.js";
import type { DeviceAction } from "../schemas/intent.schema.js";

export type PendingAction = {
  id: string;
  conversationId: string;
  action: DeviceAction;
  candidates: DeviceSummary[];
  status: "pending" | "used";
  expiresAt: number;
};

const pendingActions = new Map<string, PendingAction>();

export function createPendingAction(conversationId: string, action: DeviceAction, candidates: DeviceSummary[]) {
  const pending: PendingAction = {
    id: randomUUID(),
    conversationId,
    action,
    candidates,
    status: "pending",
    expiresAt: Date.now() + config.pendingActionTtlSeconds * 1000
  };
  pendingActions.set(pending.id, pending);
  return pending;
}

export function consumePendingAction(conversationId: string, pendingActionId: string, deviceId: string) {
  const pending = pendingActions.get(pendingActionId);
  if (!pending) {
    throw Object.assign(new Error("Pending action not found"), { code: "PENDING_ACTION_NOT_FOUND" });
  }
  if (pending.conversationId !== conversationId) {
    throw Object.assign(new Error("Pending action belongs to another conversation"), { code: "PENDING_ACTION_CONVERSATION_MISMATCH" });
  }
  if (pending.status !== "pending") {
    throw Object.assign(new Error("Pending action was already used"), { code: "PENDING_ACTION_ALREADY_USED" });
  }
  if (Date.now() > pending.expiresAt) {
    pendingActions.delete(pendingActionId);
    throw Object.assign(new Error("Pending action expired"), { code: "PENDING_ACTION_EXPIRED" });
  }
  const selectedDevice = pending.candidates.find((candidate) => candidate.device_id === deviceId);
  if (!selectedDevice) {
    throw Object.assign(new Error("Selected device is not a candidate"), { code: "PENDING_ACTION_INVALID_DEVICE" });
  }

  pending.status = "used";
  return { pending, selectedDevice };
}

export function clearPendingActionsForTest() {
  pendingActions.clear();
}
