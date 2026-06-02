'use client';

import React from 'react';
import {
  useTracks,
  LayoutContextProvider,
  useCreateLayoutContext,
  TrackReferenceOrPlaceholder,
  GridLayout,
  useLayoutContext
} from '@livekit/components-react';
import { RoomEvent, Track } from 'livekit-client';
import ParticipantGridTile from '../../components/ParticipantGridTile';

function VideoPanelContent() {
  const layoutContext = useLayoutContext();
  const cameraTracks = useTracks(
    [{ source: Track.Source.Camera, withPlaceholder: true }],
    {
      updateOnlyOn: [RoomEvent.ActiveSpeakersChanged],
      onlySubscribed: false
    }
  );

  const screenShareTracks = useTracks(
    [{ source: Track.Source.ScreenShare, withPlaceholder: false }],
    {
      onlySubscribed: false
    }
  );

  // Quản lý và đồng bộ trạng thái ghim (Pin State)
  const prevScreenShareTracksRef = React.useRef<TrackReferenceOrPlaceholder[]>([]);
  React.useEffect(() => {
    const rawPinnedTracks = layoutContext.pin.state || [];

    // 1. Phát hiện và tự động ghim (focus) màn hình chia sẻ mới khi nó xuất hiện
    const newScreenShare = screenShareTracks.find(
      (active) => !prevScreenShareTracksRef.current.some(
        (prev) => (prev.publication && active.publication && prev.publication.trackSid === active.publication.trackSid) ||
          (prev.participant.identity === active.participant.identity && prev.source === active.source)
      )
    );

    if (newScreenShare) {
      layoutContext.pin.dispatch?.({ msg: 'set_pin', trackReference: newScreenShare });
      prevScreenShareTracksRef.current = screenShareTracks;
      return;
    }
    prevScreenShareTracksRef.current = screenShareTracks;

    // 2. Tự động xóa ghim nếu đối tượng ghim không còn tồn tại/hoạt động (ví dụ tắt share màn hình hoặc rời phòng)
    if (rawPinnedTracks.length > 0) {
      const activePinnedExists = rawPinnedTracks.some((pinned) => {
        if (pinned.source === Track.Source.ScreenShare) {
          return screenShareTracks.some((active) =>
            (active.publication && pinned.publication && active.publication.trackSid === pinned.publication.trackSid) ||
            active.participant.identity === pinned.participant.identity
          );
        }
        return cameraTracks.some((active) => active.participant.identity === pinned.participant.identity);
      });
      if (!activePinnedExists) {
        layoutContext.pin.dispatch?.({ msg: 'clear_pin' });
      }
    }
  }, [cameraTracks, screenShareTracks, layoutContext.pin.state, layoutContext.pin.dispatch]);

  const hasScreenShare = screenShareTracks.length > 0;
  // Lọc danh sách ghim để chỉ giữ lại các track thực sự còn hoạt động (đang kết nối) trong phòng
  const pinnedTracks = (layoutContext.pin.state || []).filter((pinned) => {
    if (pinned.source === Track.Source.ScreenShare) {
      // Screen Share ghim chỉ hợp lệ nếu nó vẫn nằm trong danh sách screenShareTracks đang hoạt động
      return screenShareTracks.some((active) =>
        (active.publication && pinned.publication && active.publication.trackSid === pinned.publication.trackSid) ||
        active.participant.identity === pinned.participant.identity
      );
    }
    // Camera ghim chỉ hợp lệ nếu participant đó vẫn còn trong phòng (nằm trong cameraTracks)
    return cameraTracks.some((active) => active.participant.identity === pinned.participant.identity);
  });
  const hasPinnedTrack = pinnedTracks.length > 0;

  // Thuật toán xác định đối tượng hiển thị ở khung chính (focusTrack):
  // Ưu tiên ghim thủ công mới nhất nếu có bất kỳ ghim nào (camera hoặc screen share)
  // Nếu không có ghim thủ công, mặc định ưu tiên màn hình chia sẻ mới nhất nếu có.
  let focusTrack: TrackReferenceOrPlaceholder | undefined = undefined;

  if (hasPinnedTrack) {
    focusTrack = pinnedTracks[pinnedTracks.length - 1];
  } else if (hasScreenShare) {
    focusTrack = screenShareTracks[screenShareTracks.length - 1];
  }
  const hasFocus = !!focusTrack;

  // Danh sách các ô hiển thị ở cột Sidebar bên trái:
  // Bao gồm màn hình chia sẻ (nếu không phải là focusTrack) + các camera (không phải là focusTrack)
  const sidebarTracks = [
    ...screenShareTracks.filter((track) => {
      if (!focusTrack) return true;
      return !(
        track.source === focusTrack.source &&
        track.participant.identity === focusTrack.participant.identity
      );
    }),
    ...cameraTracks.filter((track) => {
      if (!focusTrack) return true;
      return !(
        track.source === focusTrack.source &&
        track.participant.identity === focusTrack.participant.identity
      );
    })
  ];

  return (
    <div className="relative w-full h-full bg-[#070708] flex flex-col text-zinc-100 overflow-hidden font-sans">
      <div className="flex-1 w-full overflow-hidden relative">
        {cameraTracks.length === 0 && screenShareTracks.length === 0 ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
            <div className="w-12 h-12 rounded-full border border-dashed border-zinc-700 animate-spin flex items-center justify-center">
              <div className="w-8 h-8 rounded-full border border-emerald-500 border-t-transparent animate-spin" />
            </div>
            <p className="text-xs text-zinc-500 font-medium">Waiting for video feeds...</p>
          </div>
        ) : hasFocus ? (
          <div className="flex w-full h-full p-4 gap-4 overflow-hidden">
            {/* Left Sidebar: Camera feeds stack */}
            <div className="w-54 shrink-0 flex flex-col gap-3 overflow-y-auto pr-1 scrollbar-thin scrollbar-thumb-zinc-800 scrollbar-track-transparent">
              {sidebarTracks.map((track) => (
                <div key={track.publication?.trackSid || track.participant.identity} className="w-full aspect-video shrink-0">
                  <ParticipantGridTile trackRef={track} />
                </div>
              ))}
            </div>

            {/* Main Area: Active Focus (Screen Share or Pinned Camera) */}
            <div className="flex-1 h-full relative rounded-2xl overflow-hidden border border-zinc-800/80 shadow-2xl bg-[#0f0f12]">
              <ParticipantGridTile trackRef={focusTrack} />
            </div>
          </div>
        ) : (
          <GridLayout tracks={cameraTracks} className="w-full h-full p-6 pb-2">
            <ParticipantGridTile />
          </GridLayout>
        )}
      </div>
    </div>
  );
}

export function VideoPanel() {
  const layoutContext = useCreateLayoutContext();

  return (
    <LayoutContextProvider value={layoutContext}>
      <VideoPanelContent />
    </LayoutContextProvider>
  );
}

export default VideoPanel;
