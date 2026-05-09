import { config } from "../config.js";

export type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

const conversations = new Map<string, ChatMessage[]>();

export function getMessageHistory(sessionId: string) {
  return conversations.get(sessionId) ?? [];
}

export function appendMessage(sessionId: string, message: ChatMessage) {
  const current = conversations.get(sessionId) ?? [];
  const next = [...current, message].slice(-(config.messageHistoryTurns * 2));
  conversations.set(sessionId, next);
}

export function clearConversationsForTest() {
  conversations.clear();
}
