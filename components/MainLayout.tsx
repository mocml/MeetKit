'use client';

import React, { useState, useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import {
  LogIn, X, Shield, Video, MessageSquare, Users, Hand, Smile, Grid,
  FileText, MoreHorizontal, VideoOff, Mic, MicOff,
  Monitor, PhoneOff, ChevronDown, Send, Paperclip, SmileIcon, Bot
} from 'lucide-react';
import Link from 'next/link';
import { Room, Track, RoomEvent } from 'livekit-client';
import { useRoomContext, useTrackToggle, useParticipants, useParticipantAttributes, useTracks, Chat, useChat } from '@livekit/components-react';
import RaiseHandPopover from './RaiseHandPopover';
import ChatSidebar from './ChatSidebar';

interface MainLayoutProps {
  children: React.ReactNode;
  room?: Room
}

export function MainLayout({ children }: MainLayoutProps) {
  const router = useRouter();
  const room = useRoomContext();
  const participants = useParticipants();
  const participantCount = participants.length;

  const [isChatOpen, setIsChatOpen] = useState(false);
  const [isPeopleOpen, setIsPeopleOpen] = useState(false);
  const [isHandListOpen, setIsHandListOpen] = useState(false);
  const [updateTrigger, setUpdateTrigger] = useState(0);

  const { chatMessages: liveMessages } = useChat();
  const lastReadMsgAt = React.useRef<number>(0);
  const [unreadCount, setUnreadCount] = useState<number>(0);

  useEffect(() => {
    if (liveMessages.length === 0) {
      setUnreadCount(0);
      return;
    }

    // Nếu đang mở chat, đánh dấu tất cả tin nhắn đã đọc (giống LiveKit)
    if (
      isChatOpen &&
      liveMessages.length > 0 &&
      lastReadMsgAt.current !== liveMessages[liveMessages.length - 1]?.timestamp
    ) {
      lastReadMsgAt.current = liveMessages[liveMessages.length - 1]?.timestamp;
      setUnreadCount(0);
      return;
    }

    // Nếu đóng chat, lọc số tin nhắn chưa đọc (giống LiveKit)
    const count = liveMessages.filter(
      (msg) => !lastReadMsgAt.current || msg.timestamp > lastReadMsgAt.current
    ).length;

    setUnreadCount(count);
  }, [liveMessages, isChatOpen]);

  // Trạng thái bảng trắng cộng tác dựa trên thuộc tính của các thành viên trong phòng
  const isWhiteboardOpen = participants.some(
    (p) => p.attributes?.isWhiteboardActive === 'true'
  );

  const toggleWhiteboard = async () => {
    if (!room?.localParticipant) return;
    const isCurrentlyActive = room.localParticipant.attributes?.isWhiteboardActive === 'true';
    try {
      await room.localParticipant.setAttributes({
        isWhiteboardActive: String(!isCurrentlyActive)
      });
    } catch (err) {
      console.error("Failed to toggle whiteboard:", err);
    }
  };

  // 1. Tự động đồng bộ và force re-render khi bất kỳ thành viên nào thay đổi attributes (giơ/hạ tay)
  useEffect(() => {
    if (!room) return;
    const forceUpdate = () => setUpdateTrigger((prev) => prev + 1);
    room.on(RoomEvent.ParticipantAttributesChanged, forceUpdate);
    room.on(RoomEvent.ParticipantMetadataChanged, forceUpdate);
    room.on(RoomEvent.ParticipantConnected, forceUpdate);
    room.on(RoomEvent.ParticipantDisconnected, forceUpdate);
    return () => {
      room.off(RoomEvent.ParticipantAttributesChanged, forceUpdate);
      room.off(RoomEvent.ParticipantMetadataChanged, forceUpdate);
      room.off(RoomEvent.ParticipantConnected, forceUpdate);
      room.off(RoomEvent.ParticipantDisconnected, forceUpdate);
    };
  }, [room]);

  // 2. Lắng nghe tín hiệu hạ tay từ xa qua LiveKit Data Channel
  useEffect(() => {
    if (!room) return;
    const handleDataReceived = (payload: Uint8Array, participant?: any) => {
      try {
        const text = new TextDecoder().decode(payload);
        const data = JSON.parse(text);
        if (data.action === 'lower_hand') {
          if (data.targetIdentity === room.localParticipant.identity) {
            room.localParticipant.setAttributes({ isHandRaised: 'false' }).catch(console.error);
          }
        } else if (data.action === 'lower_hand_all') {
          room.localParticipant.setAttributes({ isHandRaised: 'false' }).catch(console.error);
        }
      } catch (err) {
        console.error('Failed to parse data channel message:', err);
      }
    };
    room.on(RoomEvent.DataReceived, handleDataReceived);
    return () => {
      room.off(RoomEvent.DataReceived, handleDataReceived);
    };
  }, [room]);

  const { attributes } = useParticipantAttributes({
    participant: room?.localParticipant
  });
  const isHandRaised = attributes?.isHandRaised === 'true';

  const handRaisedParticipants = participants.filter(
    (p) => p.attributes?.isHandRaised === 'true'
  );
  const handRaisedCount = handRaisedParticipants.length;

  // Tự động đóng danh sách giơ tay khi không còn ai giơ tay
  useEffect(() => {
    if (handRaisedCount === 0) {
      setIsHandListOpen(false);
    }
  }, [handRaisedCount]);

  const handleLowerHand = async (targetIdentity: string) => {
    if (!room) return;

    // Nếu là hạ tay chính mình, cập nhật trực tiếp attributes
    if (targetIdentity === room.localParticipant.identity) {
      try {
        await room.localParticipant.setAttributes({ isHandRaised: 'false' });
      } catch (err) {
        console.error("Failed to lower own hand:", err);
      }
      return;
    }

    // Nếu hạ tay remote participant, gửi tín hiệu qua Data Channel
    try {
      const payload = JSON.stringify({ action: 'lower_hand', targetIdentity });
      const data = new TextEncoder().encode(payload);
      await room.localParticipant.publishData(data, {
        reliable: true,
        destinationIdentities: [targetIdentity]
      });
    } catch (err) {
      console.error("Failed to publish lower_hand message:", err);
    }
  };

  const handleLowerAllHands = async () => {
    if (!room) return;

    // Hạ tay chính mình trước
    try {
      await room.localParticipant.setAttributes({ isHandRaised: 'false' });
    } catch (err) {
      console.error("Failed to lower own hand:", err);
    }

    // Gửi tín hiệu hạ tay cho toàn bộ người họp qua Data Channel
    try {
      const payload = JSON.stringify({ action: 'lower_hand_all' });
      const data = new TextEncoder().encode(payload);
      await room.localParticipant.publishData(data, {
        reliable: true
      });
    } catch (err) {
      console.error("Failed to publish lower_hand_all message:", err);
    }
  };

  // Live Meeting Timer State
  const [elapsedSeconds, setElapsedSeconds] = useState(269); // Start at 04:29 like in the image
  useEffect(() => {
    const timer = setInterval(() => {
      setElapsedSeconds((prev) => prev + 1);
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const formatTimer = (totalSeconds: number) => {
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  };

  const {
    enabled: cameraEnabled,
    toggle: toggleCamera,
    pending: pendingCamera
  } = useTrackToggle({ source: Track.Source.Camera });
  const {
    enabled: micEnabled,
    toggle: toggleMic,
    pending: pendingMic
  } = useTrackToggle({ source: Track.Source.Microphone });
  const { enabled: screenShareEnabled,
    toggle: toggleScreenShare,
    pending: pendingScreenShare
  } = useTrackToggle({ source: Track.Source.ScreenShare });

  const screenShareTracks = useTracks(
    [{ source: Track.Source.ScreenShare, withPlaceholder: false }],
    { onlySubscribed: false }
  );
  const isSomeoneElseSharing = screenShareTracks.some((t) => !t.participant.isLocal);

  const handleScreenShareClick = () => {
    if (!screenShareEnabled) {
      if (isSomeoneElseSharing) {
        const confirmShare = window.confirm(
          "Hiện tại đang có người khác chia sẻ màn hình trong phòng. Bạn có chắc chắn muốn chia sẻ màn hình của mình không?"
        );
        if (!confirmShare) return;
      }
    }
    toggleScreenShare();
  };

  const toggleHandRaised = async () => {
    if (!room?.localParticipant) return;
    const nextState = !isHandRaised;

    try {
      await room.localParticipant.setAttributes({
        isHandRaised: String(nextState)
      });
    } catch (error) {
      console.error("Failed to update raise hand attributes:", error);
    }
  };

  return (
    <div className="h-full w-full bg-[#111112] text-[#f5f5f5] flex flex-col font-sans overflow-hidden select-none">
      <header className="h-14 shrink-0 w-full bg-[#1c1c1e] border-b border-[#2a2a2c] px-4 flex items-center justify-between z-50">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 text-zinc-400 bg-zinc-900/60 border border-zinc-800/80 px-2.5 py-1 rounded-md">
            <Shield className="w-3.5 h-3.5 text-emerald-400" />
            <span className="text-[12px] font-mono text-zinc-300 font-bold">{formatTimer(elapsedSeconds)}</span>
          </div>
          <div className="w-px h-5 bg-[#2a2a2c]" />
          <Link href="/" className="flex items-center gap-2 group">
            <Video className="w-4 h-4 text-emerald-400" />
            <span className="text-xs font-bold text-zinc-300 tracking-wide uppercase group-hover:text-white transition-colors">{room?.name}</span>
          </Link>

          <RaiseHandPopover
            isOpen={isHandListOpen}
            onToggleOpen={() => setIsHandListOpen(!isHandListOpen)}
            handRaisedParticipants={handRaisedParticipants}
            onLowerHand={handleLowerHand}
            onLowerAllHands={() => {
              handleLowerAllHands();
              setIsHandListOpen(false);
            }}
          />
        </div>
        <div className="flex items-center gap-4 h-full">
          <nav className="flex items-center gap-1.5 h-full py-1">
            <button
              onClick={() => setIsChatOpen(!isChatOpen)}
              className={`relative flex flex-col items-center justify-center w-12 h-11 rounded-lg transition-all cursor-pointer ${isChatOpen
                ? 'bg-zinc-800/80 text-emerald-400 border-b-2 border-emerald-500 rounded-b-none'
                : 'text-zinc-400 hover:bg-zinc-800/50 hover:text-zinc-200'
                }`}
            >
              <MessageSquare className="w-4.5 h-4.5" />
              <span className="text-[9px] mt-0.5 font-semibold">Chat</span>
              {unreadCount > 0 && (
                <div className="absolute top-1 right-2.5 w-2 h-2 bg-emerald-500 rounded-full shadow-[0_0_8px_rgba(16,185,129,0.8)] animate-pulse" />
              )}
            </button>

            {/* Whiteboard Toggle Button */}
            <button
              onClick={toggleWhiteboard}
              className={`flex flex-col items-center justify-center w-12 h-11 rounded-lg transition-all cursor-pointer ${
                isWhiteboardOpen
                  ? 'bg-zinc-800/80 text-emerald-400 border-b-2 border-emerald-500 rounded-b-none'
                  : 'text-zinc-400 hover:bg-zinc-800/50 hover:text-zinc-200'
              }`}
            >
              <FileText className="w-4.5 h-4.5" />
              <span className="text-[9px] mt-0.5 font-semibold">Board</span>
            </button>

            {/* People Toggle Button */}
            <button
              onClick={() => setIsPeopleOpen(!isPeopleOpen)}
              className={`flex flex-col items-center justify-center w-12 h-11 rounded-lg transition-all cursor-pointer ${isPeopleOpen
                ? 'bg-zinc-800/80 text-emerald-400 border-b-2 border-emerald-500 rounded-b-none'
                : 'text-zinc-400 hover:bg-zinc-800/50 hover:text-zinc-200'
                }`}
            >
              <div className="relative">
                <Users className="w-4.5 h-4.5" />
                <span className="absolute -top-1 -right-2 bg-zinc-700 text-[8px] font-bold text-zinc-100 rounded-full w-3.5 h-3.5 flex items-center justify-center border border-[#1c1c1e]">{participantCount}</span>
              </div>
              <span className="text-[9px] mt-0.5 font-semibold">People</span>
            </button>

            {/* Raise Hand Button */}
            <button
              onClick={toggleHandRaised}
              className={`flex flex-col items-center justify-center w-12 h-11 rounded-lg transition-all cursor-pointer ${isHandRaised
                ? 'bg-amber-500/10 text-amber-400 border-b-2 border-amber-500 rounded-b-none'
                : 'text-zinc-400 hover:bg-zinc-800/50 hover:text-zinc-200'
                }`}
            >
              <Hand className="w-4.5 h-4.5" />
              <span className="text-[9px] mt-0.5 font-semibold">Raise</span>
            </button>

            {/* More Dropdown */}
            <button className="flex flex-col items-center justify-center w-12 h-11 rounded-lg text-zinc-400 hover:bg-zinc-800/50 hover:text-zinc-200 transition-all cursor-pointer">
              <MoreHorizontal className="w-4.5 h-4.5" />
              <span className="text-[9px] mt-0.5 font-semibold">More</span>
            </button>
          </nav>

          <div className="w-px h-5 bg-[#2a2a2c] mx-1" />

          {/* Media Toggles */}
          <div className="flex items-center bg-[#252528] rounded-lg p-0.5 gap-1 border border-zinc-800/60">
            {/* Camera */}
            <button
              onClick={() => toggleCamera()}
              disabled={pendingCamera}
              className={`p-2 rounded-md transition-all cursor-pointer ${cameraEnabled ? 'text-zinc-200 hover:bg-zinc-700/60' : 'bg-rose-600/20 text-rose-400 hover:bg-rose-600/30'
                }`}
            >
              {cameraEnabled ? <Video className="w-4.5 h-4.5" /> : <VideoOff className="w-4.5 h-4.5" />}
            </button>
            {/* Microphone */}
            <button
              onClick={() => toggleMic()}
              disabled={pendingMic}
              className={`p-2 rounded-md transition-all cursor-pointer ${micEnabled ? 'text-zinc-200 hover:bg-zinc-700/60' : 'bg-rose-600/20 text-rose-400 hover:bg-rose-600/30'
                }`}
            >
              {micEnabled ? <Mic className="w-4.5 h-4.5" /> : <MicOff className="w-4.5 h-4.5" />}
            </button>
            {/* Screen Share */}
            <button
              onClick={handleScreenShareClick}
              disabled={pendingScreenShare}
              className={`p-2 rounded-md transition-all cursor-pointer ${screenShareEnabled ? 'bg-emerald-600/20 text-emerald-400 hover:bg-emerald-600/30' : 'text-zinc-200 hover:bg-zinc-700/60'
                }`}
            >
              <Monitor className="w-4.5 h-4.5" />
            </button>
          </div>

          <div className="w-px h-5 bg-[#2a2a2c] mx-1" />

          {/* Red Leave Button Group */}
          <div className="flex items-stretch rounded-lg overflow-hidden border border-rose-500/20 shadow-md">
            <button
              onClick={() => router.push('/')}
              className="bg-[#c43131] hover:bg-[#b02929] text-white px-3.5 py-1.5 text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <PhoneOff className="w-3.5 h-3.5" />
              <span>Leave</span>
            </button>
            <button className="bg-[#b32b2b] hover:bg-[#a12424] text-white px-1.5 py-1.5 transition-colors border-l border-white/10 flex items-center justify-center cursor-pointer">
              <ChevronDown className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className="w-px h-5 bg-[#2a2a2c] mx-1" />
        </div>
      </header>

      {/* 2. Workspace Viewport - Splitted into Video Grid (Left) and Chat Sidebar (Right) */}
      <div className="flex-1 w-full flex overflow-hidden relative">

        {/* Left Side: Main Page / Embedded Screen (children) */}
        <main className="flex-1 h-full overflow-hidden relative bg-[#0e0e10] flex flex-col z-10">
          {children}
        </main>
        <ChatSidebar
          isOpen={isChatOpen}
          onClose={() => setIsChatOpen(false)}
        />
      </div>
    </div>
  );
}

export default MainLayout;
