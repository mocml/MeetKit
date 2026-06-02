'use client';
import { ConnectionDetails } from '@/lib/types';
import { LiveKitRoom, usePersistentUserChoices } from '@livekit/components-react';
import { Room, RoomEvent, RoomOptions, TrackPublishDefaults, VideoPresets } from 'livekit-client';
import { useParams, useRouter } from 'next/navigation'
import React from 'react'
import VideoPanel from './VideoPanel';
import MainLayout from '@/components/MainLayout';

const CONN_DETAILS_ENDPOINT = '/api/connection-details';
const video_codec = 'vp9';
const singlePC = true;
const hq = false;
export default function AutoJoin() {
    const params = useParams();
    const router = useRouter();
    const { userChoices } = usePersistentUserChoices({
        preventLoad: true,
        defaults: {
            videoEnabled: false,
            audioEnabled: false
        }

    });
    const [connectionDetails, setConnectionDetails] = React.useState<ConnectionDetails | undefined>(
        undefined,
    );
    const handleOnLeave = React.useCallback(() => router.push('/'), [router]);
    const handleError = React.useCallback((error: Error) => {
        console.error(error);
        alert(`Encountered an unexpected error, check the console logs for details: ${error.message}`);
    }, []);
    const preJoinDefault = async () => {
        const url = new URL(CONN_DETAILS_ENDPOINT, window.location.origin);
        url.searchParams.append("roomName", params.roomName as string);

        const storedName = sessionStorage.getItem('vmeet_username');
        url.searchParams.append("participantName", storedName as string);
        const resp = await fetch(url);
        const connectionDetailsData = await resp.json();
        setConnectionDetails(connectionDetailsData);
    }
    const roomOptions = React.useMemo((): RoomOptions => {
        const videoCaptureDefault = {
            deviceId: userChoices.videoDeviceId,
            resolution: hq ? VideoPresets.h2160 : VideoPresets.h720
        }
        const publishDefault: TrackPublishDefaults = {
            dtx: false,
            videoSimulcastLayers: hq
                ? [VideoPresets.h1080, VideoPresets.h720]
                : [VideoPresets.h540, VideoPresets.h216],
            red: false,
            videoCodec: video_codec
        }
        return {
            videoCaptureDefaults: videoCaptureDefault,
            publishDefaults: publishDefault,
            audioCaptureDefaults: {
                deviceId: userChoices.audioDeviceId ?? undefined,
            },
            adaptiveStream: true,
            dynacast: true,
            singlePeerConnection: singlePC,
        }

    }, [userChoices, hq, video_codec]);
    const room = React.useMemo(() => new Room(roomOptions), []);

    React.useEffect(() => {
        preJoinDefault();
    }, [])
    React.useEffect(() => {
        room.on(RoomEvent.Disconnected, handleOnLeave)
        room.on(RoomEvent.MediaDevicesError, handleError);
        return () => {
            room.off(RoomEvent.Disconnected, handleOnLeave)
            room.off(RoomEvent.MediaDevicesError, handleError);
        }
    }, [room, userChoices, connectionDetails])
    return (
        <LiveKitRoom room={room}
            token={connectionDetails?.participantToken}
            serverUrl={connectionDetails?.serverUrl}
            connect={true}
            video={userChoices.videoEnabled}
            audio={userChoices.audioEnabled}
            options={roomOptions}
        >
            <MainLayout room={room}>
                <VideoPanel />
            </MainLayout>
        </LiveKitRoom>
    )
}
