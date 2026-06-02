'use client';

import React from 'react';
import { X, Bot, Send, Paperclip, SmileIcon } from 'lucide-react';
import { useChat } from '@livekit/components-react';

export interface ChatMessage {
  id: number;
  sender: string;
  text: string;
  time?: string;
  isSelf?: boolean;
  isSystem?: boolean;
  image?: string;
}

export interface ChatSidebarProps {
  isOpen: boolean;
  onClose: () => void;
}

export function ChatSidebar({
  isOpen,
  onClose,
}: ChatSidebarProps) {
  const textareaRef = React.useRef<HTMLTextAreaElement>(null);
  const scrollContainerRef = React.useRef<HTMLDivElement>(null);

  const { chatMessages, send, isSending } = useChat()
  React.useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = 'auto';
    textarea.style.height = `${textarea.scrollHeight}px`;
  }, [chatMessages, isOpen]);

  React.useEffect(() => {
    const container = scrollContainerRef.current;
    if (container) {
      container.scrollTop = container.scrollHeight;
    }
  }, [chatMessages, isOpen]);

  if (!isOpen) return null;
  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (isSending) return;

    const text = textareaRef.current?.value || '';
    if (text.trim() === '') return;

    // Xóa chữ trong ô input và reset độ cao NGAY LẬP TỨC để tránh gửi trùng lặp
    if (textareaRef.current) {
      textareaRef.current.value = '';
      textareaRef.current.style.height = 'auto';
    }

    try {
      await send(text);
      if (textareaRef.current) {
        textareaRef.current.focus();
      }
    } catch (err) {
      console.error("Failed to send message:", err);
      // Nếu gửi lỗi, khôi phục lại chữ trong ô nhập để người dùng không bị mất nội dung
      if (textareaRef.current) {
        textareaRef.current.value = text;
      }
    }
  }
  return (
    <aside className="w-85 h-full bg-[#1c1c1e] border-l border-[#2a2a2c] flex flex-col shrink-0 z-20 shadow-[inset_1px_0_0_rgba(255,255,255,0.03)] animate-in slide-in-from-right duration-300">
      <button
        onClick={onClose}
        className=" p-1 ml-auto mr-2.5 mt-2.5 rounded-md text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/60 transition-all cursor-pointer"
      >
        <X className="w-4 h-4" />
      </button>
      <div
        ref={scrollContainerRef}
        className="flex-1 overflow-y-auto p-4 flex flex-col gap-1 text-xs"
      >
        {chatMessages.map((msg, idx, allMsg) => {
          const hideName = idx >= 1 && allMsg[idx - 1].from === msg.from;
          const hideTimestamp = idx >= 1 && msg.timestamp - allMsg[idx - 1].timestamp < 60_000;
          return (
            <div key={msg.id}
              className={`flex flex-col gap-1 ${!hideName && 'pt-2'} ${msg.from?.isLocal ? 'items-end' : 'items-start'}`}>
              {(!hideName || !hideTimestamp) &&
                <div className="flex items-center gap-1.5 px-1">
                  {!hideName && <span className="font-bold text-zinc-300">{msg.from?.name ?? msg.from?.identity}</span>}
                  <span className="text-[10px] text-zinc-500">
                    {new Date(msg.timestamp).toLocaleTimeString(undefined, { timeStyle: 'short' })}
                  </span>
                </div>}
              <div className={`p-2.5 rounded-xl max-w-65 leading-relaxed shadow-sm ${msg.from?.isLocal
                ? 'bg-emerald-600/10 text-emerald-300 border border-emerald-500/20 rounded-tr-none'
                : 'bg-zinc-850/80 text-zinc-300 border border-zinc-800/80 rounded-tl-none'
                }`}>
                <p>{msg.message}</p>
              </div>
            </div>
          );
        })}
      </div>
      {/* Sidebar Bottom Input Box */}
      <form onSubmit={handleSubmit} className="p-3 border-t border-[#2a2a2c] bg-[#171719] flex flex-col gap-2 shrink-0">
        <div className={`items-end flex gap-2 bg-[#202022] border border-[#2d2d30] rounded-lg pl-3 pr-2 py-2 focus-within:border-emerald-500/50 transition-colors`}>
          <textarea
            ref={textareaRef}
            placeholder="Type a message..."
            onInput={(ev) => ev.stopPropagation()}
            onKeyUp={(ev) => ev.stopPropagation()}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.nativeEvent.isComposing) {
                return;
              }
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                if (textareaRef.current?.value.trim()) {
                  e.currentTarget.form?.requestSubmit();
                }
              }
            }}
            rows={1}
            className="flex-1 bg-transparent border-0 max-h-16 focus:outline-none resize-none overflow-y-auto text-xs text-zinc-200 placeholder-zinc-500 scrollbar-thin scrollbar-thumb-zinc-800 p-0 py-0.5"
          />
          <button
            type="submit"
            disabled={isSending}
            className={`mt-auto transition-colors ${textareaRef.current?.value.trim()
              ? 'text-emerald-500 hover:text-emerald-400 cursor-pointer'
              : 'text-zinc-600 cursor-not-allowed opacity-50'
              }`}
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
      </form>
    </aside>
  );
}

export default ChatSidebar;
