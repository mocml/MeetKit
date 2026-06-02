import * as React from 'react';
import { PageClientImpl } from './PageClientImpl';
import { isVideoCodec } from '@/lib/types';
import AutoJoin from '@/app/custom/AutoJoin';
import MainLayout from '@/components/MainLayout';

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ roomName: string }>;
  searchParams: Promise<{
    // FIXME: We should not allow values for regions if in playground mode.
    region?: string;
    hq?: string;
    codec?: string;
    singlePC?: string;
  }>;
}) {
  const _params = await params;
  console.log("🚀 ~ Page ~ _params:", _params)
  const _searchParams = await searchParams;
  console.log("🚀 ~ Page ~ _searchParams:", _searchParams)
  const codec =
    typeof _searchParams.codec === 'string' && isVideoCodec(_searchParams.codec)
      ? _searchParams.codec
      : 'vp9';
  console.log("🚀 ~ Page ~ codec:", codec)
  const hq = _searchParams.hq === 'true' ? true : false;
  console.log("🚀 ~ Page ~ hq:", hq)
  const singlePC = _searchParams.singlePC !== 'false';
  console.log("🚀 ~ Page ~ singlePC:", singlePC)

  return (
    <>
      <AutoJoin />
      {/* <PageClientImpl
        roomName={_params.roomName}
        region={_searchParams.region}
        hq={hq}
        codec={codec}
        singlePeerConnection={singlePC}
      /> */}
    </>
  );
}
