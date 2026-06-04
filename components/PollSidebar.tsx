'use client';

import React, { useState, useEffect } from 'react';
import { X, Plus, Trash2, Check, BarChart2, AlertCircle } from 'lucide-react';
import { useRoomContext, useParticipants } from '@livekit/components-react';
import { RoomEvent } from 'livekit-client';

export interface PollOption {
  id: string;
  text: string;
  votes: string[]; // Danh sách các identity đã vote cho option này
}

export interface Poll {
  id: string;
  question: string;
  options: PollOption[];
  creator: string;
  isActive: boolean;
}

export const voteUpdateQueue = {
  current: Promise.resolve() as Promise<any>
};

interface PollSidebarProps {
  isOpen: boolean;
  onClose: () => void;
}

export function PollSidebar({ isOpen, onClose }: PollSidebarProps) {
  const room = useRoomContext();
  const participants = useParticipants();
  const localParticipant = room?.localParticipant;

  // Trạng thái cho Form tạo cuộc bình chọn mới
  const [question, setQuestion] = useState('');
  const [options, setOptions] = useState<string[]>(['', '']);

  // Trạng thái vote tạm thời để tối ưu trải nghiệm (Optimistic UI)
  const [optimisticVoteOptionId, setOptimisticVoteOptionId] = useState<string | null>(null);

  // Trạng thái cuộc bình chọn hiện tại (đồng bộ thời gian thực qua Data Channel + dự phòng Attributes)
  const [activePoll, setActivePoll] = useState<Poll | null>(null);
  const activePollOwnerIdentity = activePoll?.creator || null;

  // Đồng bộ trạng thái từ attributes khi có thay đổi từ server (phục vụ Late-joiner hoặc dự phòng)
  useEffect(() => {
    const scanActivePollFromAttributes = () => {
      if (!localParticipant) return null;
      const allParticipants = [
        localParticipant,
        ...participants.filter((p) => p.identity !== localParticipant.identity)
      ];
      for (const p of allParticipants) {
        const pollAttr = p.attributes.activePoll;
        if (pollAttr) {
          try {
            const parsed = JSON.parse(pollAttr) as Poll;
            if (parsed) return parsed;
          } catch (e) {}
        }
      }
      return null;
    };

    const serverPoll = scanActivePollFromAttributes();
    if (serverPoll) {
      setActivePoll((prev) => {
        // Nếu chưa có poll cục bộ hoặc ID khác biệt hoàn toàn thì nhận ngay
        if (!prev || prev.id !== serverPoll.id) {
          return serverPoll;
        }
        // Tính tổng số phiếu bầu
        const prevVotes = prev.options.reduce((sum, opt) => sum + opt.votes.length, 0);
        const serverVotes = serverPoll.options.reduce((sum, opt) => sum + opt.votes.length, 0);
        // Chỉ ghi đè từ server nếu server có dữ liệu mới hơn (nhiều vote hơn), hoặc server báo kết thúc
        if (serverVotes > prevVotes || !serverPoll.isActive) {
          return serverPoll;
        }
        return prev;
      });
    } else {
      setActivePoll(null);
    }
  }, [participants, localParticipant]);

  // Lắng nghe các sự kiện Data Channel thời gian thực (WebRTC) để cập nhật kết quả tức thời
  useEffect(() => {
    if (!room) return;
    const handleDataReceived = (payload: Uint8Array, participant?: any, kind?: any, topic?: string) => {
      if (topic === 'poll') {
        try {
          const text = new TextDecoder().decode(payload);
          const data = JSON.parse(text);
          if ((data.action === 'poll_update' || data.action === 'poll_create') && data.poll) {
            setActivePoll(data.poll);
          } else if (data.action === 'poll_end') {
            setActivePoll((prev) => prev ? { ...prev, isActive: false } : null);
          }
        } catch (e) {
          console.error('Failed to parse poll data message:', e);
        }
      }
    };
    room.on(RoomEvent.DataReceived, handleDataReceived);
    return () => {
      room.off(RoomEvent.DataReceived, handleDataReceived);
    };
  }, [room]);

  // 2. Xử lý tạo cuộc bình chọn mới
  const handleCreatePoll = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!room || !localParticipant) return;

    const trimmedQuestion = question.trim();
    const validOptions = options.map((opt) => opt.trim()).filter((opt) => opt !== '');

    if (!trimmedQuestion || validOptions.length < 2) {
      alert('Vui lòng nhập câu hỏi và tối thiểu 2 phương án bình chọn!');
      return;
    }

    const newPoll: Poll = {
      id: `poll-${Math.random().toString(36).substring(2, 9)}`,
      question: trimmedQuestion,
      options: validOptions.map((opt, idx) => ({
        id: `opt-${idx}-${Math.random().toString(36).substring(2, 5)}`,
        text: opt,
        votes: []
      })),
      creator: localParticipant.identity,
      isActive: true
    };

    try {
      // Lưu poll vào thuộc tính của chính mình trên server LiveKit để đồng bộ và phục vụ Late-joiner
      await localParticipant.setAttributes({
        activePoll: JSON.stringify(newPoll)
      });

      // Cập nhật trạng thái cục bộ ngay lập tức
      setActivePoll(newPoll);

      // Phát đi tín hiệu poll_create để hiển thị thông báo tức thời cho những người đang online (gửi kèm đối tượng poll để đồng bộ nhanh)
      const payload = JSON.stringify({ action: 'poll_create', pollId: newPoll.id, poll: newPoll });
      const data = new TextEncoder().encode(payload);
      await localParticipant.publishData(data, {
        reliable: true,
        topic: 'poll'
      });

      // Reset form
      setQuestion('');
      setOptions(['', '']);
    } catch (err) {
      console.error('Failed to start poll:', err);
    }
  };

  // 3. Xử lý gửi phiếu bầu (Vote) qua Data Channel lên người tạo (Creator)
  const handleVote = async (optionId: string) => {
    if (!room || !localParticipant || !activePoll || !activePollOwnerIdentity || !activePoll.isActive) return;

    // Nếu click vào đúng phương án đang được chọn hiển thị thì không cần gửi lại
    const currentSelectedId = optimisticVoteOptionId !== null ? optimisticVoteOptionId : myVoteOptionId;
    if (optionId === currentSelectedId) return;

    // Thiết lập trạng thái optimistic UI ngay lập tức
    setOptimisticVoteOptionId(optionId);

    // Nếu chính mình là người tạo cuộc bình chọn, cập nhật trực tiếp vào attributes thay vì gửi qua Data Channel (sử dụng hàng đợi tuần tự)
    if (localParticipant.identity === activePollOwnerIdentity) {
      voteUpdateQueue.current = voteUpdateQueue.current.then(async () => {
        const latestAttr = localParticipant.attributes.activePoll;
        if (!latestAttr) return;
        try {
          const currentPoll = JSON.parse(latestAttr) as Poll;
          currentPoll.options.forEach((opt) => {
            opt.votes = opt.votes.filter(identity => identity !== localParticipant.identity);
          });
          const selectedOpt = currentPoll.options.find((opt) => opt.id === optionId);
          if (selectedOpt) {
            selectedOpt.votes.push(localParticipant.identity);
          }

          // Cập nhật trạng thái cục bộ ngay lập tức
          setActivePoll(currentPoll);

          // Phát sóng kết quả mới qua Data Channel WebRTC để đồng bộ nhanh (10-50ms) cho mọi người
          const payload = JSON.stringify({ action: 'poll_update', poll: currentPoll });
          const encoded = new TextEncoder().encode(payload);
          await localParticipant.publishData(encoded, {
            reliable: true,
            topic: 'poll'
          });

          await localParticipant.setAttributes({
            activePoll: JSON.stringify(currentPoll)
          });
        } catch (err) {
          console.error('Failed to update self attributes for creator vote:', err);
          setOptimisticVoteOptionId(null);
        }
      });
      return;
    }

    // Gửi vote lên Creator (Single Source of Truth) để tránh xung đột
    try {
      const payload = JSON.stringify({
        action: 'poll_vote',
        pollId: activePoll.id,
        optionId,
        voterIdentity: localParticipant.identity
      });
      const data = new TextEncoder().encode(payload);
      
      await localParticipant.publishData(data, {
        reliable: true,
        destinationIdentities: [activePollOwnerIdentity],
        topic: 'poll'
      });
    } catch (err) {
      console.error('Failed to submit vote:', err);
      // Nếu lỗi thì xóa optimistic state
      setOptimisticVoteOptionId(null);
    }
  };

  // 4. Xử lý kết thúc cuộc bình chọn (Chỉ dành cho người tạo)
  const handleEndPoll = async () => {
    if (!room || !localParticipant || !activePoll || activePoll.creator !== localParticipant.identity) return;

    const endedPoll = { ...activePoll, isActive: false };
    try {
      // Cập nhật lại attributes trên server thành inactive
      await localParticipant.setAttributes({
        activePoll: JSON.stringify(endedPoll)
      });

      // Cập nhật trạng thái cục bộ lập tức
      setActivePoll(endedPoll);

      // Phát tín hiệu đóng poll tức thời
      const payload = JSON.stringify({ action: 'poll_end', pollId: activePoll.id });
      const data = new TextEncoder().encode(payload);
      await localParticipant.publishData(data, {
        reliable: true,
        topic: 'poll'
      });
    } catch (err) {
      console.error('Failed to end poll:', err);
    }
  };

  // 5. Xử lý xóa hoàn toàn lịch sử cuộc bình chọn để tạo cuộc mới (Chỉ dành cho người tạo)
  const handleResetPoll = async () => {
    if (!room || !localParticipant || !activePoll || activePoll.creator !== localParticipant.identity) return;

    try {
      // Xóa thuộc tính activePoll khỏi attributes
      await localParticipant.setAttributes({
        activePoll: ''
      });

      // Reset trạng thái cục bộ lập tức
      setActivePoll(null);
    } catch (err) {
      console.error('Failed to reset poll:', err);
    }
  };

  // Các thao tác tùy biến Options Form
  const addOptionField = () => {
    if (options.length >= 6) return;
    setOptions([...options, '']);
  };

  const removeOptionField = (index: number) => {
    if (options.length <= 2) return;
    setOptions(options.filter((_, idx) => idx !== index));
  };

  const handleOptionChange = (value: string, index: number) => {
    const updated = [...options];
    updated[index] = value;
    setOptions(updated);
  };

  // Tính toán số liệu thống kê phiếu bầu
  const totalVotes = activePoll
    ? activePoll.options.reduce((sum, opt) => sum + opt.votes.length, 0)
    : 0;

  const myVoteOptionId = activePoll && localParticipant
    ? activePoll.options.find((opt) => opt.votes.includes(localParticipant.identity))?.id
    : null;

  // Reset trạng thái optimistic khi cuộc bình chọn thay đổi
  const activePollId = activePoll?.id || null;
  useEffect(() => {
    setOptimisticVoteOptionId(null);
  }, [activePollId]);

  // Đồng bộ reset trạng thái optimistic khi dữ liệu từ máy chủ đã cập nhật khớp với lựa chọn
  useEffect(() => {
    if (myVoteOptionId && myVoteOptionId === optimisticVoteOptionId) {
      setOptimisticVoteOptionId(null);
    }
  }, [myVoteOptionId, optimisticVoteOptionId]);

  // Tính tổng số phiếu bầu hiển thị (tính cả thay đổi của Optimistic UI)
  let displayTotalVotes = totalVotes;
  if (optimisticVoteOptionId !== null && optimisticVoteOptionId !== myVoteOptionId) {
    if (myVoteOptionId === null) {
      displayTotalVotes = totalVotes + 1;
    }
  }

  const hasVoted = (myVoteOptionId !== null) || (optimisticVoteOptionId !== null);

  return (
    <aside
      className={`fixed top-0 right-0 h-full w-85 bg-zinc-900/95 backdrop-blur-xl border-l border-zinc-800/80 shadow-2xl flex flex-col z-40 transition-transform duration-300 ease-in-out ${
        isOpen ? 'translate-x-0' : 'translate-x-full'
      }`}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-4 border-b border-zinc-800/60">
        <div className="flex items-center gap-2">
          <BarChart2 className="w-5 h-5 text-emerald-400" />
          <h2 className="text-sm font-bold text-zinc-100 uppercase tracking-wider">Bình chọn</h2>
        </div>
        <button
          onClick={onClose}
          className="p-1 rounded-md text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/60 transition-all cursor-pointer"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto p-4 scrollbar-thin scrollbar-thumb-zinc-800 scrollbar-track-transparent">
        {!activePoll ? (
          /* FORM TẠO BÌNH CHỌN MỚI */
          <form onSubmit={handleCreatePoll} className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-zinc-400">Câu hỏi biểu quyết</label>
              <textarea
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                placeholder="Nhập câu hỏi của bạn..."
                rows={2}
                maxLength={150}
                className="w-full text-sm bg-zinc-950/70 border border-zinc-800/60 rounded-xl px-3 py-2.5 text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-emerald-500/80 transition-colors resize-none"
                required
              />
            </div>

            <div className="space-y-2">
              <label className="text-xs font-semibold text-zinc-400">Các phương án lựa chọn</label>
              {options.map((opt, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <input
                    type="text"
                    value={opt}
                    onChange={(e) => handleOptionChange(e.target.value, idx)}
                    placeholder={`Phương án ${idx + 1}`}
                    maxLength={50}
                    className="flex-1 text-sm bg-zinc-950/70 border border-zinc-800/60 rounded-xl px-3 h-10 text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-emerald-500/80 transition-colors"
                    required
                  />
                  {options.length > 2 && (
                    <button
                      type="button"
                      onClick={() => removeOptionField(idx)}
                      className="p-2 text-zinc-500 hover:text-rose-400 hover:bg-rose-500/10 rounded-xl transition-all cursor-pointer border border-transparent hover:border-rose-500/20"
                      title="Xóa phương án"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              ))}
            </div>

            {options.length < 6 && (
              <button
                type="button"
                onClick={addOptionField}
                className="w-full flex items-center justify-center gap-1.5 py-2 text-xs font-semibold text-zinc-400 hover:text-zinc-200 bg-zinc-950/40 hover:bg-zinc-950/80 border border-zinc-800/40 rounded-xl transition-all cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Thêm phương án</span>
              </button>
            )}

            <button
              type="submit"
              className="w-full py-2.5 text-sm font-bold bg-emerald-500 hover:bg-emerald-600 text-zinc-950 rounded-xl shadow-[0_4px_12px_rgba(16,185,129,0.2)] transition-all cursor-pointer hover:scale-[1.01] active:scale-99"
            >
              Bắt đầu bình chọn
            </button>
          </form>
        ) : (
          /* GIAO DIỆN BÌNH CHỌN VÀ THỐNG KÊ KẾT QUẢ */
          <div className="space-y-5">
            {/* Thẻ trạng thái */}
            <div className="flex items-center justify-between bg-zinc-950/40 border border-zinc-800/30 px-3 py-2 rounded-xl">
              <div className="flex items-center gap-1.5">
                <div className={`w-2 h-2 rounded-full ${activePoll.isActive ? 'bg-emerald-500 animate-pulse' : 'bg-zinc-600'}`} />
                <span className="text-xs font-bold text-zinc-300">
                  {activePoll.isActive ? 'Đang mở' : 'Đã kết thúc'}
                </span>
              </div>
              <span className="text-[10px] text-zinc-500 font-mono">
                Tổng số phiếu: {displayTotalVotes}
              </span>
            </div>

            {/* Câu hỏi */}
            <div className="space-y-1">
              <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-wide">Câu hỏi</span>
              <h3 className="text-sm font-semibold text-zinc-200 leading-snug">{activePoll.question}</h3>
            </div>

            {/* Danh sách bình chọn */}
            <div className="space-y-3.5">
              {activePoll.options.map((opt) => {
                const optVotes = opt.votes.length;
                let displayOptVotes = optVotes;
                
                if (optimisticVoteOptionId !== null && optimisticVoteOptionId !== myVoteOptionId) {
                  if (opt.id === optimisticVoteOptionId) {
                    displayOptVotes = optVotes + 1;
                  } else if (opt.id === myVoteOptionId) {
                    displayOptVotes = Math.max(0, optVotes - 1);
                  }
                }

                const percent = displayTotalVotes > 0 ? Math.round((displayOptVotes / displayTotalVotes) * 100) : 0;
                const isSelected = optimisticVoteOptionId !== null
                  ? optimisticVoteOptionId === opt.id
                  : myVoteOptionId === opt.id;
                const canVote = activePoll!.isActive;

                return (
                  <div key={opt.id} className="space-y-1.5">
                    <button
                      onClick={() => canVote && handleVote(opt.id)}
                      disabled={!canVote}
                      className={`relative w-full overflow-hidden text-left border rounded-xl p-3 flex items-center justify-between transition-all select-none ${
                        isSelected
                          ? 'border-emerald-500/80 bg-emerald-500/5'
                          : 'border-zinc-800/50 bg-zinc-950/50 hover:border-zinc-700/60'
                      } ${canVote ? 'cursor-pointer active:scale-99' : 'cursor-default'}`}
                    >
                      {/* Thanh phần trăm chạy mờ ở nền */}
                      <div
                        className="absolute left-0 top-0 bottom-0 bg-emerald-500/10 transition-all duration-500"
                        style={{ width: `${percent}%` }}
                      />

                      {/* Text & Icon Check */}
                      <span className={`text-xs font-medium z-10 pr-4 ${isSelected ? 'text-emerald-400 font-bold' : 'text-zinc-300'}`}>
                        {opt.text}
                      </span>
                      <div className="flex items-center gap-1.5 z-10 shrink-0">
                        {isSelected && <Check className="w-3.5 h-3.5 text-emerald-400" />}
                        <span className="text-xs font-mono font-bold text-zinc-400">{percent}%</span>
                      </div>
                    </button>
                    {/* Hiển thị số phiếu tuyệt đối bên dưới */}
                    <div className="flex justify-end text-[9px] text-zinc-500 font-mono px-1">
                      {displayOptVotes} phiếu
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Thông báo đã bầu */}
            {hasVoted && activePoll.isActive && (
              <div className="flex items-start gap-1.5 bg-zinc-950/40 border border-emerald-500/20 p-2.5 rounded-xl text-[10px] text-emerald-400/90 leading-normal">
                <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-px" />
                <span>Bạn đã bình chọn. Bạn có thể chọn phương án khác để thay đổi lá phiếu của mình khi bình chọn còn mở.</span>
              </div>
            )}

            {/* Các quyền quản trị dành riêng cho Creator */}
            {activePoll.creator === localParticipant?.identity && (
              <div className="pt-4 border-t border-zinc-800/60 space-y-2">
                {activePoll.isActive ? (
                  <button
                    onClick={handleEndPoll}
                    className="w-full py-2 text-xs font-bold bg-rose-600 hover:bg-rose-700 text-white rounded-xl shadow-[0_4px_12px_rgba(220,38,38,0.15)] transition-all cursor-pointer hover:scale-[1.01] active:scale-99"
                  >
                    Kết thúc bình chọn
                  </button>
                ) : (
                  <button
                    onClick={handleResetPoll}
                    className="w-full py-2 text-xs font-bold bg-zinc-800 hover:bg-zinc-750 border border-zinc-700/50 text-zinc-300 rounded-xl transition-all cursor-pointer hover:scale-[1.01] active:scale-99"
                  >
                    Tạo cuộc bình chọn mới
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </aside>
  );
}

export default PollSidebar;
