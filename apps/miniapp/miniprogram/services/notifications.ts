import { requestJson } from "./api";

export type NotificationType = "comment" | "system" | "like" | "follow" | "intro" | "introResult";

export type NotificationData = {
  postId?: string;
  fromUserId?: string;
  requestId?: string;
  introId?: string;
};

export type NotificationItem = {
  id: string;
  type: NotificationType;
  title: string;
  content: string;
  createdAt: number;
  readAt: number | null;
  data?: NotificationData;
};

export async function listNotifications(): Promise<NotificationItem[]> {
  const res = await requestJson<{ items: NotificationItem[] }>("GET", "/notifications");
  return Array.isArray(res.items) ? res.items : [];
}

export async function markAllNotificationsRead(): Promise<void> {
  await requestJson("POST", "/notifications/read-all", {});
}

export async function markNotificationRead(id: string): Promise<number | null> {
  const res = await requestJson<{ ok: boolean; readAt: number }>("POST", `/notifications/${encodeURIComponent(id)}/read`, {});
  return typeof res?.readAt === "number" ? res.readAt : null;
}
