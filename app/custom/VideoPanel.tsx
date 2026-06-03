'use client';

import React from 'react';
import {
  useTracks,
  LayoutContextProvider,
  useCreateLayoutContext,
  TrackReferenceOrPlaceholder,
  GridLayout,
  useLayoutContext,
  useParticipants
} from '@livekit/components-react';
import { RoomEvent, Track } from 'livekit-client';
import ParticipantGridTile from '../../components/ParticipantGridTile';
import { Whiteboard } from '../../components/Whiteboard';
import { Palette, Pin } from 'lucide-react';

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
  const participants = useParticipants();
  const isWhiteboardOpen = participants.some(
    (p) => p.attributes?.isWhiteboardActive === 'true'
  );

  // Trạng thái ghim bảng trắng cục bộ
  const [isWhiteboardPinned, setIsWhiteboardPinned] = React.useState(true);

  // Đồng bộ bật ghim bảng trắng khi nó bắt đầu được mở lên lần đầu
  const prevIsWhiteboardOpenRef = React.useRef(false);
  React.useEffect(() => {
    if (isWhiteboardOpen && !prevIsWhiteboardOpenRef.current) {
      setIsWhiteboardPinned(true);
    }
    prevIsWhiteboardOpenRef.current = isWhiteboardOpen;
  }, [isWhiteboardOpen]);

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

  // 3. Tự động tương tác hai chiều giữa Ghim Bảng Trắng và Ghim Video Track khác
  React.useEffect(() => {
    if (hasPinnedTrack && isWhiteboardPinned) {
      setIsWhiteboardPinned(false); // Nhường chỗ cho video track được ghim thủ công
    }
  }, [hasPinnedTrack, isWhiteboardPinned]);

  React.useEffect(() => {
    if (isWhiteboardOpen && !hasPinnedTrack && !isWhiteboardPinned) {
      setIsWhiteboardPinned(true); // Tự động ghim lại bảng vẽ khi người dùng bỏ ghim video track khác
    }
  }, [isWhiteboardOpen, hasPinnedTrack, isWhiteboardPinned]);

  // Thuật toán xác định đối tượng hiển thị ở khung chính (focusItem):
  let focusItem:
    | { type: 'whiteboard' }
    | { type: 'track'; track: TrackReferenceOrPlaceholder }
    | undefined = undefined;

  if (isWhiteboardOpen) {
    if (isWhiteboardPinned) {
      focusItem = { type: 'whiteboard' };
    } else if (hasPinnedTrack) {
      focusItem = { type: 'track', track: pinnedTracks[pinnedTracks.length - 1] };
    } else {
      focusItem = { type: 'whiteboard' };
    }
  } else if (hasPinnedTrack) {
    focusItem = { type: 'track', track: pinnedTracks[pinnedTracks.length - 1] };
  } else if (hasScreenShare) {
    focusItem = { type: 'track', track: screenShareTracks[screenShareTracks.length - 1] };
  }

  const hasFocus = !!focusItem;

  // Danh sách các ô hiển thị ở cột Sidebar bên trái:
  const sidebarItems: (
    | { type: 'track'; track: TrackReferenceOrPlaceholder }
    | { type: 'whiteboard' }
  )[] = [];

  // Nếu bảng vẽ đang mở nhưng KHÔNG được ghim ở khung chính, đưa nó vào sidebar
  if (isWhiteboardOpen && focusItem?.type !== 'whiteboard') {
    sidebarItems.push({ type: 'whiteboard' });
  }

  // Đưa các ScreenShare không phải là focusItem vào sidebar
  screenShareTracks.forEach((track) => {
    const isFocus =
      focusItem?.type === 'track' &&
      focusItem.track.source === track.source &&
      focusItem.track.participant.identity === track.participant.identity;
    if (!isFocus) {
      sidebarItems.push({ type: 'track', track });
    }
  });

  // Đưa các Camera không phải là focusItem vào sidebar
  cameraTracks.forEach((track) => {
    const isFocus =
      focusItem?.type === 'track' &&
      focusItem.track.source === track.source &&
      focusItem.track.participant.identity === track.participant.identity;
    if (!isFocus) {
      sidebarItems.push({ type: 'track', track });
    }
  });

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
        ) : focusItem ? (
          <div className="flex w-full h-full p-4 gap-4 overflow-hidden">
            {/* Left Sidebar: Camera feeds + Whiteboard tile stack */}
            {sidebarItems.length > 0 && (
              <div className="w-54 shrink-0 flex flex-col gap-3 overflow-y-auto pr-1 scrollbar-thin scrollbar-thumb-zinc-800 scrollbar-track-transparent">
                {sidebarItems.map((item, idx) => {
                  if (item.type === 'whiteboard') {
                    return (
                      <div key="whiteboard-sidebar" className="w-full aspect-video shrink-0">
                        <div className="group relative w-full h-full bg-[#0f0f12] rounded-2xl overflow-hidden border border-zinc-800/80 shadow-md flex flex-col items-center justify-center gap-1.5 select-none">
                          <div className="w-9 h-9 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
                            <Palette className="w-4 h-4" />
                          </div>
                          <span className="text-[10px] font-semibold text-zinc-400">Bảng vẽ chung</span>

                          {/* Nút Ghim Whiteboard từ sidebar */}
                          <div className="absolute top-2 right-2 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-40">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setIsWhiteboardPinned(true);
                                layoutContext.pin.dispatch?.({ msg: 'clear_pin' }); // Bỏ ghim các video track khác
                              }}
                              className="flex items-center justify-center w-7 h-7 rounded-full bg-zinc-950/70 text-zinc-300 hover:text-white hover:bg-zinc-900/90 border border-zinc-800/80 backdrop-blur-md cursor-pointer transition-all duration-200"
                              title="Ghim bảng vẽ"
                            >
                              <Pin className="w-3 h-3" />
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  } else {
                    return (
                      <div key={item.track.publication?.trackSid || item.track.participant.identity} className="w-full aspect-video shrink-0">
                        <ParticipantGridTile trackRef={item.track} />
                      </div>
                    );
                  }
                })}
              </div>
            )}

            {/* Main Area: Active Focus (Whiteboard, Screen Share, or Pinned Camera) */}
            <div className="flex-1 h-full relative rounded-2xl overflow-hidden border border-zinc-800/80 shadow-2xl bg-[#0f0f12]">
              {focusItem.type === 'whiteboard' ? (
                <>
                  <Whiteboard />
                  {/* Nút Bỏ ghim Whiteboard khi đang ở chính giữa để đẩy nó về sidebar */}
                  <div className="absolute top-4 right-4 z-40">
                    <button
                      onClick={() => setIsWhiteboardPinned(false)}
                      className="flex items-center justify-center w-9 h-9 rounded-xl bg-zinc-900/90 hover:bg-zinc-800 text-emerald-400 border border-zinc-800 shadow-md backdrop-blur-md cursor-pointer transition-all duration-200 hover:scale-105 active:scale-95"
                      title="Bỏ ghim bảng vẽ"
                    >
                      <Pin className="w-4 h-4" />
                    </button>
                  </div>
                </>
              ) : (
                <ParticipantGridTile trackRef={focusItem.track} />
              )}
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
