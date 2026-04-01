import { create } from "zustand";

export interface ChatMessage {
  id: string;
  userId: string | null;
  username: string;
  message: string;
  isSystem: boolean;
  createdAt: string;
}

interface ChatStore {
  messages: ChatMessage[];
  unreadCount: number;
  isOpen: boolean;

  addMessage: (message: ChatMessage) => void;
  setMessages: (messages: ChatMessage[]) => void;
  incrementUnread: () => void;
  resetUnread: () => void;
  setIsOpen: (open: boolean) => void;
}

export const useChatStore = create<ChatStore>((set) => ({
  messages: [],
  unreadCount: 0,
  isOpen: false,

  addMessage: (message) =>
    set((state) => ({
      messages: [...state.messages, message].slice(-200),
      unreadCount: state.isOpen ? 0 : state.unreadCount + 1,
    })),

  setMessages: (messages) => set({ messages }),

  incrementUnread: () =>
    set((state) => ({ unreadCount: state.unreadCount + 1 })),

  resetUnread: () => set({ unreadCount: 0 }),

  setIsOpen: (open) => set({ isOpen: open, unreadCount: open ? 0 : 0 }),
}));
