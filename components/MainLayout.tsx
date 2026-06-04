'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  Shield, Video, MessageSquare, Users, Hand,
  FileText, MoreHorizontal, VideoOff, Mic, MicOff,
  Monitor, BarChart2
} from 'lucide-react';
import Link from 'next/link';
import { Room, Track, RoomEvent } from 'livekit-client';
import { useRoomContext, useTrackToggle, useParticipants, useParticipantAttributes, useTracks, Chat, useChat, useTranscriptions } from '@livekit/components-react';
import RaiseHandPopover from './RaiseHandPopover';
import ChatSidebar from './ChatSidebar';
import PollSidebar, { Poll, voteUpdateQueue } from './PollSidebar';
import toast from 'react-hot-toast';
import { NavToggleButton, MediaToggleButton, LeaveButton } from './LayoutButtons';

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
  const [isPollOpen, setIsPollOpen] = useState(false);
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

  // 2. Lắng nghe tín hiệu hạ tay và biểu quyết qua LiveKit Data Channel
  useEffect(() => {
    if (!room) return;
    const handleDataReceived = (payload: Uint8Array, participant?: any, kind?: any, topic?: string) => {
      try {
        const text = new TextDecoder().decode(payload);
        const data = JSON.parse(text);

        // Xử lý gói tin bình chọn (topic: 'poll')
        if (topic === 'poll') {
          if (data.action === 'poll_create') {
            toast.success('Có cuộc bình chọn mới vừa bắt đầu!', {
              icon: '📊',
              style: {
                background: '#18181b',
                color: '#f4f4f5',
                border: '1px solid #27272a'
              }
            });
            setIsPollOpen(true); // Tự động mở Sidebar để người dùng tiện bình chọn
          } else if (data.action === 'poll_end') {
            toast('Cuộc bình chọn đã kết thúc và có kết quả!', {
              icon: '🏁',
              style: {
                background: '#18181b',
                color: '#f4f4f5',
                border: '1px solid #27272a'
              }
            });
          } else if (data.action === 'poll_vote') {
            // Chỉ người tạo Poll mới kiểm phiếu bầu và lưu kết quả lên server LiveKit (sử dụng hàng đợi tuần tự để tránh race condition)
            voteUpdateQueue.current = voteUpdateQueue.current.then(async () => {
              const activePollAttr = room.localParticipant.attributes.activePoll;
              if (!activePollAttr) return;
              try {
                const currentPoll = JSON.parse(activePollAttr) as Poll;
                if (currentPoll && currentPoll.id === data.pollId && currentPoll.isActive) {
                  // Xóa phiếu bầu cũ của voter (nếu họ đổi phương án)
                  currentPoll.options.forEach((opt) => {
                    opt.votes = opt.votes.filter((identity) => identity !== data.voterIdentity);
                  });
                  // Ghi nhận phiếu bầu mới vào phương án được chọn
                  const selectedOpt = currentPoll.options.find((opt) => opt.id === data.optionId);
                  if (selectedOpt) {
                    selectedOpt.votes.push(data.voterIdentity);
                  }
                  // Cập nhật thuộc tính activePoll mới lên server LiveKit và đợi phản hồi từ máy chủ
                  await room.localParticipant.setAttributes({
                    activePoll: JSON.stringify(currentPoll)
                  });
                }
              } catch (e) {
                console.error('Failed to update poll votes in queue:', e);
              }
            }).catch((err) => {
              console.error('Error in voteUpdateQueue execution:', err);
            });
          }
          return;
        }

        // Xử lý hạ tay
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

  // Live Meeting TimerState
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

  const { enabled: cameraEnabled, toggle: toggleCamera, pending: pendingCamera } = useTrackToggle({ source: Track.Source.Camera });
  const { enabled: micEnabled, toggle: toggleMic, pending: pendingMic } = useTrackToggle({ source: Track.Source.Microphone });
  const { enabled: screenShareEnabled, toggle: toggleScreenShare, pending: pendingScreenShare } = useTrackToggle({ source: Track.Source.ScreenShare });

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
            <NavToggleButton
              onClick={() => setIsChatOpen(!isChatOpen)}
              isActive={isChatOpen}
              icon={<MessageSquare className="w-4.5 h-4.5" />}
              label="Chat"
              badge={unreadCount > 0 ? (
                <div className="absolute top-0 -right-1 w-2 h-2 bg-emerald-500 rounded-full shadow-[0_0_8px_rgba(16,185,129,0.8)] animate-pulse" />
              ) : undefined}
            />

            <NavToggleButton
              onClick={toggleWhiteboard}
              isActive={isWhiteboardOpen}
              icon={<FileText className="w-4.5 h-4.5" />}
              label="Board"
            />

            <NavToggleButton
              onClick={() => setIsPollOpen(!isPollOpen)}
              isActive={isPollOpen}
              icon={<BarChart2 className="w-4.5 h-4.5" />}
              label="Poll"
            />

            <NavToggleButton
              onClick={() => setIsPeopleOpen(!isPeopleOpen)}
              isActive={isPeopleOpen}
              icon={<Users className="w-4.5 h-4.5" />}
              label="People"
              badge={
                <span className="absolute -top-1.5 -right-2 bg-zinc-700 text-[8px] font-bold text-zinc-100 rounded-full w-3.5 h-3.5 flex items-center justify-center border border-[#1c1c1e]">
                  {participantCount}
                </span>
              }
            />

            <NavToggleButton
              onClick={toggleHandRaised}
              isActive={isHandRaised}
              icon={<Hand className="w-4.5 h-4.5" />}
              label="Raise"
              activeColor="amber"
            />

            {/* More Dropdown */}
            <button className="flex flex-col items-center justify-center w-12 h-11 rounded-lg text-zinc-400 hover:bg-zinc-800/50 hover:text-zinc-200 transition-all cursor-pointer">
              <MoreHorizontal className="w-4.5 h-4.5" />
              <span className="text-[9px] mt-0.5 font-semibold">More</span>
            </button>
          </nav>

          <div className="w-px h-5 bg-[#2a2a2c] mx-1" />

          {/* Media Toggles */}
          <div className="flex items-center bg-[#252528] rounded-lg p-0.5 gap-1 border border-zinc-800/60">
            <MediaToggleButton
              onClick={() => toggleCamera()}
              disabled={pendingCamera}
              isEnabled={cameraEnabled}
              enabledIcon={<Video className="w-4.5 h-4.5" />}
              disabledIcon={<VideoOff className="w-4.5 h-4.5" />}
              activeColor="normal"
              inactiveColor="rose"
            />

            <MediaToggleButton
              onClick={() => toggleMic()}
              disabled={pendingMic}
              isEnabled={micEnabled}
              enabledIcon={<Mic className="w-4.5 h-4.5" />}
              disabledIcon={<MicOff className="w-4.5 h-4.5" />}
              activeColor="normal"
              inactiveColor="rose"
            />

            <MediaToggleButton
              onClick={handleScreenShareClick}
              disabled={pendingScreenShare}
              isEnabled={screenShareEnabled}
              enabledIcon={<Monitor className="w-4.5 h-4.5" />}
              activeColor="emerald"
              inactiveColor="normal"
            />
          </div>

          <div className="w-px h-5 bg-[#2a2a2c] mx-1" />

          <LeaveButton onLeave={() => router.push('/')} />
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
        <PollSidebar
          isOpen={isPollOpen}
          onClose={() => setIsPollOpen(false)}
        />
      </div>
    </div>
  );
}

export default MainLayout;
