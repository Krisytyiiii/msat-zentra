// Push delivery (Firebase Cloud Messaging).
//
// The mobile app registers its FCM registration token via
// POST /api/notifications/device-token after sign-in; `fanoutNotification`
// mirrors every inbox row onto those devices. Nothing here may break a write:
// an unconfigured project (no FIREBASE_SERVICE_ACCOUNT_JSON) turns push into a
// no-op, and any FCM error is logged and swallowed.

import { cert, getApps, initializeApp, type App } from "firebase-admin/app";
import { getMessaging } from "firebase-admin/messaging";

import { getEnv } from "../config/env.js";
import { logger } from "./pino.js";
import { prisma } from "./prisma.js";

const CHANNEL_ID = "zentra_default";
const BATCH_SIZE = 500; // FCM multicast hard limit

let app: App | null = null;
let initFailed = false;

function loadServiceAccount(): Record<string, unknown> | null {
  const raw = getEnv().FIREBASE_SERVICE_ACCOUNT_JSON?.trim();
  if (!raw) return null;
  try {
    // Accept the JSON blob itself or its base64 encoding (easier in env UIs).
    const json = raw.startsWith("{") ? raw : Buffer.from(raw, "base64").toString("utf8");
    const parsed = JSON.parse(json);
    if (parsed && typeof parsed === "object" && typeof parsed.private_key === "string") {
      return parsed as Record<string, unknown>;
    }
    logger.warn("FIREBASE_SERVICE_ACCOUNT_JSON is missing private_key; push disabled");
  } catch (e) {
    logger.warn({ err: e }, "FIREBASE_SERVICE_ACCOUNT_JSON is not valid JSON; push disabled");
  }
  return null;
}

/** Lazily initialise the Admin SDK once. Null means push is not configured. */
function messaging() {
  if (initFailed) return null;
  if (app) return getMessaging(app);
  if (getApps().length > 0) {
    app = getApps()[0]!;
    return getMessaging(app);
  }
  const serviceAccount = loadServiceAccount();
  if (!serviceAccount) return null;
  try {
    app = initializeApp({
      credential: cert(serviceAccount as Parameters<typeof cert>[0]),
      projectId: String(serviceAccount.project_id ?? ""),
    });
    return getMessaging(app);
  } catch (e) {
    initFailed = true;
    logger.error({ err: e }, "Firebase Admin initialisation failed; push disabled");
    return null;
  }
}

export function pushConfigured(): boolean {
  return Boolean(getEnv().FIREBASE_SERVICE_ACCOUNT_JSON?.trim());
}

/**
 * Human title for the OS notification. Mirrors the in-app label maps on the
 * client, but keyed only on `type` (message sniffing belongs to the inbox UI).
 */
export function pushTitle(type: string, sourceTable?: string | null): string {
  const map: Record<string, string> = {
    new_adm_case: "New ADM case",
    adm_decision: "ADM case update",
    adm_decision_self: "ADM case updated",
    adm_endorse: "ADM consultation endorsed",
    adm_endorse_self: "ADM consultation endorsed",
    meeting_booked: "Parent meeting booked",
    meeting_booked_self: "Parent meeting booked",
    meeting_rescheduled: "Parent meeting rescheduled",
    meeting_rescheduled_self: "Parent meeting rescheduled",
    meeting_outcome: "Meeting outcome recorded",
    meeting_outcome_self: "Meeting outcome recorded",
    meeting_cancelled: "Parent meeting cancelled",
    principal_verdict: "Principal decision on ADM case",
    referral_status_change: "Referral update",
    new_adm_referral: "New ADM referral",
    referral_form_saved: "Referral form saved",
    referral_deleted_self: "Referral deleted",
    intervention_detected: "Advisee needs support",
    intervention_approved: "Intervention approved",
    intervention_assigned: "Intervention assigned",
    intervention_assigned_self: "Intervention assigned",
    intervention_session: "Intervention session update",
    intervention_session_self: "Intervention session update",
    intervention_outcome: "Intervention outcome",
    intervention_outcome_self: "Intervention outcome",
    intervention_alert: "Intervention alert",
    new_followup: "New follow-up",
    sf10_validated: "SF10 validated",
    sf10_released: "SF10 released",
    sf10_needs_validation: "SF10 needs validation",
    sf10_access_requested: "SF10 access requested",
    sf10_access_decision: "SF10 access decision",
    account_approval: "Account approved",
    account_pending: "New account awaiting approval",
    finals_ready: "Finals ready",
    grade_locked: "Grades locked",
    grade_flag_opened: "Grade flag opened",
    grade_flag_resolved: "Grade flag resolved",
    attendance_subject_alert: "Attendance alert",
    attendance_sweep: "Attendance updated",
    attendance_created: "Attendance recorded",
    attendance_unlocked: "Attendance unlocked",
    score_saved: "Score saved",
    score_saved_self: "Score saved",
    module_released: "New module released",
    module_submitted: "Module submitted",
    device_issued: "Device issued",
    device_issued_self: "Device issued",
    device_returned: "Device returned",
    device_returned_self: "Device returned",
    device_overdue: "Device overdue",
    schedule_updated: "Schedule updated",
    schedule_submitted: "Schedule submitted",
    schedule_approved: "Schedule approved",
    schedule_rejected: "Schedule rejected",
    assignment_created: "New class assignment",
    assignment_removed: "Class assignment removed",
    adviser_assigned: "Adviser assigned",
    academics_updated: "Academics updated",
    roster_enlisted: "Learner enlisted",
    roster_updated: "Learner updated",
    roster_archived: "Learner archived",
    roster_restored: "Learner restored",
    session_cancelled: "Session cancelled",
    session_cancelled_self: "Session cancelled",
  };
  if (map[type]) return map[type];
  if (type.startsWith("new_")) return "Zentra update";
  if (sourceTable) {
    const table = sourceTable.replace(/^adm_/, "").replace(/_/g, " ");
    return `Zentra · ${table.charAt(0).toUpperCase()}${table.slice(1)}`;
  }
  return "Zentra";
}

export interface PushPayload {
  notificationId: string;
  type: string;
  sourceTable?: string | null;
  sourceId?: string | null;
  message: string;
}

/**
 * Deliver one inbox row to every registered device of a user.
 * Fire-and-forget: callers never await delivery success.
 */
export async function sendPushToUser(userId: string, payload: PushPayload): Promise<void> {
  try {
    if (!pushConfigured()) return;
    const tokens = await prisma.deviceToken.findMany({
      where: { userId },
      select: { token: true },
    });
    if (tokens.length === 0) return;
    const m = messaging();
    if (!m) return;

    const data = {
      notificationId: payload.notificationId,
      type: payload.type,
      sourceTable: payload.sourceTable ?? "",
      sourceId: payload.sourceId ?? "",
      route: "",
    };
    const dead: string[] = [];

    for (let i = 0; i < tokens.length; i += BATCH_SIZE) {
      const batch = tokens.slice(i, i + BATCH_SIZE).map((t) => t.token);
      const res = await m.sendEachForMulticast({
        tokens: batch,
        // `notification` is what the OS shows when the app is backgrounded or
        // killed; `data` is what the tap handler routes with.
        notification: { title: pushTitle(payload.type, payload.sourceTable), body: payload.message },
        data,
        android: {
          priority: "high",
          notification: {
            channelId: CHANNEL_ID,
            icon: "ic_stat_zentra",
            color: "#2563EB",
            tag: payload.sourceTable ? `${payload.sourceTable}:${payload.sourceId ?? ""}` : payload.notificationId,
          },
        },
        apns: {
          payload: {
            aps: {
              sound: "default",
              "thread-id": payload.type,
              "mutable-content": 0,
            },
          },
        },
      });
      res.responses.forEach((r, idx) => {
        if (r.success) return;
        const code = r.error?.code ?? "";
        // `invalid-argument` also covers payload problems (bad image URL), so it
        // must not delete a token that may still be perfectly valid.
        if (
          code === "messaging/registration-token-not-registered" ||
          code === "messaging/invalid-registration-token"
        ) {
          dead.push(batch[idx]!);
        } else {
          logger.warn({ code, userId }, "push delivery failed");
        }
      });
    }

    if (dead.length) {
      await prisma.deviceToken.deleteMany({ where: { token: { in: dead } } });
    }
  } catch (e) {
    logger.error({ err: e, userId }, "push fanout failed");
  }
}
