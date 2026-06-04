'use client';
import { ConnectionDetails } from '@/lib/types';
import {
    LiveKitRoom,
    LocalUserChoices,
    PreJoin,
} from '@livekit/components-react';
import { Room, RoomEvent, RoomOptions, TrackPublishDefaults, VideoPresets } from 'livekit-client';
import { useParams, useRouter } from 'next/navigation'
import React from 'react'
import VideoPanel from './VideoPanel';
import MainLayout from '@/components/MainLayout';

import toast from 'react-hot-toast';

const CONN_DETAILS_ENDPOINT = '/api/connection-details';
const video_codec = 'vp9';
const singlePC = true;
const hq = false;

export default function AutoJoin() {
    const params = useParams();
    const router = useRouter();

    const [preJoinChoices, setPreJoinChoices] = React.useState<LocalUserChoices | undefined>(undefined);
    const [connectionDetails, setConnectionDetails] = React.useState<ConnectionDetails | undefined>(undefined);

    const preJoinDefaults = React.useMemo(() => ({
        username: '',
        videoEnabled: true,
        audioEnabled: true,
    }), []);

    const handlePreJoinSubmit = React.useCallback(async (values: LocalUserChoices) => {
        setPreJoinChoices(values);
        const url = new URL(CONN_DETAILS_ENDPOINT, window.location.origin);
        url.searchParams.append('roomName', params.roomName as string);
        url.searchParams.append('participantName', values.username);
        const resp = await fetch(url.toString());
        const connectionDetailsData = await resp.json();
        setConnectionDetails(connectionDetailsData);
    }, [params.roomName]);

    const handlePreJoinError = React.useCallback((e: Error) => {
        console.error(e);
        toast.error(`Lỗi thiết bị: ${e.message}`, {
            style: { background: '#18181b', color: '#f4f4f5', border: '1px solid #27272a' }
        });
    }, []);

    const handleOnLeave = React.useCallback(() => router.push('/'), [router]);
    const handleError = React.useCallback((error: Error) => {
        console.error(error);
        toast.error(`Gặp lỗi kết nối thiết bị: ${error.message === 'Requested device not found' ? 'Không tìm thấy thiết bị camera/micro yêu cầu.' : error.message}`, {
            style: { background: '#18181b', color: '#f4f4f5', border: '1px solid #27272a' }
        });
    }, []);

    const roomOptions = React.useMemo((): RoomOptions => {
        const videoCaptureDefault = {
            deviceId: preJoinChoices?.videoDeviceId,
            resolution: hq ? VideoPresets.h2160 : VideoPresets.h720
        };
        const publishDefault: TrackPublishDefaults = {
            dtx: false,
            videoSimulcastLayers: hq
                ? [VideoPresets.h1080, VideoPresets.h720]
                : [VideoPresets.h540, VideoPresets.h216],
            red: false,
            videoCodec: video_codec
        };
        return {
            videoCaptureDefaults: videoCaptureDefault,
            publishDefaults: publishDefault,
            audioCaptureDefaults: {
                deviceId: preJoinChoices?.audioDeviceId ?? undefined,
            },
            adaptiveStream: true,
            dynacast: true,
            singlePeerConnection: singlePC,
        };
    }, [preJoinChoices]);

    const room = React.useMemo(() => new Room(roomOptions), []);

    React.useEffect(() => {
        room.on(RoomEvent.Disconnected, handleOnLeave);
        room.on(RoomEvent.MediaDevicesError, handleError);
        return () => {
            room.off(RoomEvent.Disconnected, handleOnLeave);
            room.off(RoomEvent.MediaDevicesError, handleError);
        };
    }, [room, handleOnLeave, handleError]);

    // Show PreJoin screen until user submits
    if (!preJoinChoices || !connectionDetails) {
        return (
            <main data-lk-theme="default" style={{ height: '100%', display: 'grid', placeItems: 'center' }}>
                <PreJoin
                    defaults={preJoinDefaults}
                    onSubmit={handlePreJoinSubmit}
                    onError={handlePreJoinError}
                />
            </main>
        );
    }
    return (
        <LiveKitRoom
            room={room}
            token={connectionDetails.participantToken}
            serverUrl={connectionDetails.serverUrl}
            connect={true}
            video={preJoinChoices.videoEnabled}
            audio={preJoinChoices.audioEnabled}
            options={roomOptions}
        >
            <MainLayout room={room}>
                <VideoPanel />
            </MainLayout>
        </LiveKitRoom>
    );
}
