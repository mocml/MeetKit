'use client';

import React from 'react';
import {
  VideoTrack,
  AudioTrack,
  TrackMutedIndicator,
  useEnsureTrackRef,
  useTrackMutedIndicator,
  useParticipantAttribute,
  useLayoutContext,
  useParticipants,
  FocusToggle,
  isTrackReference,
  TrackReferenceOrPlaceholder,
  useSpeakingParticipants,
  useTracks
} from '@livekit/components-react';
import { Track } from 'livekit-client';
import { Monitor, Hand, Pin } from 'lucide-react';

export interface ParticipantGridTileProps {
  trackRef?: TrackReferenceOrPlaceholder;
}

export function ParticipantGridTile({ trackRef }: ParticipantGridTileProps) {
  const resolvedTrackRef = useEnsureTrackRef(trackRef);
  const { isMuted } = useTrackMutedIndicator(resolvedTrackRef);
  const isScreenShare = resolvedTrackRef.source === Track.Source.ScreenShare;
  const name = resolvedTrackRef.participant.name || resolvedTrackRef.participant.identity;
  const isLocal = resolvedTrackRef.participant.isLocal;

  const isHandRaised = useParticipantAttribute('isHandRaised', {
    participant: resolvedTrackRef.participant
  }) === 'true';

  const layoutContext = useLayoutContext();
  const pinnedTracks = layoutContext.pin.state || [];
  const isPinned = pinnedTracks.some(
    (pinned) =>
      pinned.participant.identity === resolvedTrackRef.participant.identity &&
      pinned.source === resolvedTrackRef.source
  );

  const participants = useParticipants();

  // Kiểm tra xem bảng trắng chung có đang được bật hay không
  const isWhiteboardOpen = participants.some(
    (p) => p.attributes?.isWhiteboardActive === 'true'
  );

  // Lấy các track camera và share screen thực tế đang hoạt động (không bao gồm placeholder tắt cam)
  const activeVideoTracks = useTracks([
    { source: Track.Source.Camera, withPlaceholder: false },
    { source: Track.Source.ScreenShare, withPlaceholder: false }
  ]);

  // Hiển thị nút Pin khi:
  // 1. Có từ 2 người tham gia trở lên
  // 2. Có từ 2 luồng video camera/screen share thực tế đang phát
  // 3. Hoặc khi bảng trắng đang mở (vì bảng trắng đóng vai trò như 1 track hiển thị chiếm dụng không gian)
  const showPinButton = participants.length > 1 || activeVideoTracks.length >= 2 || isWhiteboardOpen;

  const speakingParticipants = useSpeakingParticipants();
  const isSpeaking = speakingParticipants.some(
    (p) => p.identity === resolvedTrackRef.participant.identity
  );

  return (
    <div
      className={`group relative flex items-center justify-center w-full h-full bg-[#0f0f12] rounded-2xl overflow-hidden transition-all duration-300 shadow-xl border-2 ${isSpeaking
          ? 'border-emerald-500 shadow-[0_0_15px_rgba(16,185,129,0.35)] z-10'
          : 'border-transparent'
        }`}
    >
      {isTrackReference(resolvedTrackRef) && !isMuted ? (
        <>
          <VideoTrack
            trackRef={resolvedTrackRef}
            className={`absolute inset-0 w-full h-full bg-black ${isScreenShare ? 'object-contain' : 'object-cover rotate-y-180'}`}
          />
          <AudioTrack trackRef={resolvedTrackRef} />
        </>
      ) : (
        <div className="flex flex-col items-center justify-center gap-4 text-center">
          <div className="relative">
            <div className="absolute inset-0 rounded-full bg-emerald-500/5 blur-xl animate-pulse" />
            <div className="w-32 h-32 rounded-full bg-zinc-900 border border-zinc-800 flex items-center justify-center text-2xl font-bold text-zinc-300 uppercase shadow-inner">
              {name.charAt(0)}
            </div>
          </div>
        </div>
      )}
      <div className="absolute bottom-3 left-3 flex items-center gap-1.5 bg-zinc-950/70 backdrop-blur-md px-3 py-1.5 rounded-lg text-xs font-semibold text-zinc-200 border border-zinc-800/80">
        <TrackMutedIndicator trackRef={{
          participant: resolvedTrackRef.participant,
          source: Track.Source.Microphone
        }} show='muted' />
        <span>{name}</span>
        {isLocal && (
          <span className="text-[9px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-1.5 py-px rounded font-semibold">
            You
          </span>
        )}
        {isScreenShare && (
          <span className="text-[9px] bg-sky-500/10 text-sky-400 border border-sky-500/20 px-1.5 py-px rounded flex items-center gap-1">
            <Monitor className="w-2.5 h-2.5" />
            Screen
          </span>
        )}
      </div>

      {/* Top Right Controls Overlay */}
      <div className="absolute top-3 right-3 flex items-center gap-2 z-40">
        {isHandRaised && (
          <div className="flex items-center justify-center w-8 h-8 rounded-full bg-amber-500 text-zinc-950 border border-amber-400 shadow-[0_0_12px_rgba(245,158,11,0.5)] animate-bounce">
            <Hand className="w-4 h-4 fill-zinc-950" />
          </div>
        )}

        {showPinButton && (
          <FocusToggle
            trackRef={resolvedTrackRef}
            className={`my-custom-pin-button flex items-center justify-center w-8 h-8 rounded-full transition-all duration-200 border border-zinc-800/80 backdrop-blur-md cursor-pointer ${isPinned
                ? 'bg-emerald-500 text-zinc-950 border-emerald-400 hover:bg-emerald-600 shadow-[0_0_12px_rgba(16,185,129,0.4)] opacity-100 visible'
                : 'bg-zinc-950/70 text-zinc-300 hover:text-white hover:bg-zinc-900/90 opacity-0 invisible group-hover:opacity-100 group-hover:visible'
              }`}
          >
            <Pin className={`w-3.5 h-3.5 ${isPinned ? 'fill-zinc-950' : ''}`} />
          </FocusToggle>
        )}
      </div>
    </div>
  );
}

export default ParticipantGridTile;
