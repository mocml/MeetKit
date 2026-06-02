'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { generateRoomId } from '@/lib/client-utils';
import { Button } from '@/components/ui/button';
import { Video, User } from 'lucide-react';

export default function Page() {
  const router = useRouter();
  const [username, setUsername] = useState('');

  const startMeeting = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = username.trim();
    if (trimmed) {
      sessionStorage.setItem('vmeet_username', trimmed);
    }
    router.push(`/rooms/${generateRoomId()}`);
  };

  return (
    <div className="flex flex-col justify-center items-center h-screen bg-[#111112] text-zinc-100 font-sans p-4">
      <div className="w-full max-w-md bg-[#1c1c1e] border border-zinc-800/80 rounded-2xl p-8 shadow-2xl space-y-6">
        <div className="text-center space-y-2">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 mb-2">
            <Video className="w-6 h-6" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight bg-linear-to-r from-white to-zinc-400 bg-clip-text text-transparent">
            Chào mừng đến với VMeet
          </h1>
          <p className="text-sm text-zinc-400">
            Trải nghiệm họp trực tuyến chất lượng cao, bảo mật và mượt mà
          </p>
        </div>

        <form onSubmit={startMeeting} className="space-y-4">
          <div className="space-y-2">
            <label htmlFor="username" className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">
              Tên của bạn
            </label>
            <div className="relative">
              <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-zinc-500">
                <User className="w-4 h-4" />
              </span>
              <input
                id="username"
                type="text"
                required
                autoComplete={"off"}
                placeholder="Nhập tên hiển thị..."
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full bg-[#202022] border border-[#2d2d30] rounded-xl pl-10 pr-4 py-3 text-sm text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/50 transition-all duration-200"
              />
            </div>
          </div>

          <Button
            type="submit"
            disabled={!username.trim()}
            className="w-full text-white py-6 rounded-xl border-none bg-emerald-500 hover:bg-emerald-600 font-bold transition-all duration-200 cursor-pointer shadow-lg shadow-emerald-500/10"
          >
            Bắt đầu cuộc họp
          </Button>
        </form>
      </div>
    </div>
  );
}