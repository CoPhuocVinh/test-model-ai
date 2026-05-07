import { config } from "../config.js";

export type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

const conversations = new Map<string, ChatMessage[]>();

export function getMessageHistory(conversationId: string) {
  return conversations.get(conversationId) ?? [];
}

export function appendMessage(conversationId: string, message: ChatMessage) {
  const current = conversations.get(conversationId) ?? [];
  const next = [...current, message].slice(-(config.messageHistoryTurns * 2));
  conversations.set(conversationId, next);
}

export function clearConversationsForTest() {
  conversations.clear();
}
