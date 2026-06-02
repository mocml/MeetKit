'use client';

import React from 'react';
import { Participant } from 'livekit-client';
import { Hand, ChevronDown } from 'lucide-react';

export interface RaiseHandPopoverProps {
  isOpen: boolean;
  onToggleOpen: () => void;
  handRaisedParticipants: Participant[];
  onLowerHand: (identity: string) => void;
  onLowerAllHands: () => void;
}

export function RaiseHandPopover({
  isOpen,
  onToggleOpen,
  handRaisedParticipants,
  onLowerHand,
  onLowerAllHands
}: RaiseHandPopoverProps) {
  const handRaisedCount = handRaisedParticipants.length;

  if (handRaisedCount === 0) return null;

  return (
    <>
      <div className="w-px h-5 bg-[#2a2a2c]" />
      <div className="relative">
        <button
          onClick={onToggleOpen}
          className="flex items-center gap-1.5 text-amber-400 bg-amber-500/10 border border-amber-500/30 hover:bg-amber-500/20 px-2.5 py-1 rounded-md transition-all cursor-pointer animate-pulse"
        >
          <Hand className="w-3.5 h-3.5 fill-amber-400 animate-bounce" />
          <span className="text-xs font-semibold">{handRaisedCount} người giơ tay</span>
          <ChevronDown className="w-3 h-3 text-amber-500/70" />
        </button>

        {isOpen && (
          <div className="absolute top-9 left-0 w-72 bg-zinc-950/95 backdrop-blur-md border border-zinc-800/80 rounded-xl shadow-2xl p-3.5 z-[100] flex flex-col gap-2.5 animate-in fade-in zoom-in duration-200">
            <div className="flex items-center justify-between border-b border-zinc-900 pb-2">
              <span className="text-xs font-bold text-zinc-200">Danh sách giơ tay</span>
              <button
                onClick={onLowerAllHands}
                className="text-[10px] bg-rose-500/10 text-rose-400 border border-rose-500/20 hover:bg-rose-500/20 px-2 py-0.5 rounded transition-all cursor-pointer font-bold"
              >
                Hạ tất cả
              </button>
            </div>
            <div className="max-h-48 overflow-y-auto flex flex-col gap-2 pr-1 scrollbar-thin scrollbar-thumb-zinc-800">
              {handRaisedParticipants.map((p) => {
                const name = p.name || p.identity;
                const isSelf = p.isLocal;
                return (
                  <div key={p.identity} className="flex items-center justify-between bg-zinc-900/40 border border-zinc-850/60 rounded-lg p-2 gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="w-6 h-6 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center text-[10px] font-bold text-zinc-300 uppercase shrink-0">
                        {name.charAt(0)}
                      </div>
                      <span className="text-xs text-zinc-200 truncate font-semibold">
                        {name} {isSelf && <span className="text-[9px] text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-1 py-px rounded ml-1 font-bold">Bạn</span>}
                      </span>
                    </div>
                    <button
                      onClick={() => onLowerHand(p.identity)}
                      className="text-[10px] text-zinc-400 hover:text-rose-400 bg-zinc-850 hover:bg-zinc-800 border border-zinc-800 px-2 py-1 rounded transition-all cursor-pointer font-medium"
                    >
                      Hạ tay
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </>
  );
}

export default RaiseHandPopover;
