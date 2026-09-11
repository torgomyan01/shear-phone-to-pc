"use client";

import { useEffect, useRef } from "react";

interface VideoStageProps {
  stream: MediaStream | null;
}

export const VideoStage = ({ stream }: VideoStageProps) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) {
      return;
    }

    video.srcObject = stream;
  }, [stream]);

  return (
    <div className="relative flex h-full w-full items-center justify-center bg-black">
      <div className="relative aspect-[9/16] h-full max-h-full max-w-full">
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className="h-full w-full object-cover"
        />
        {!stream ? (
          <div className="absolute inset-0 flex items-center justify-center bg-black">
            <p className="px-6 text-center text-sm tracking-wide text-zinc-500">
              Waiting for phone camera…
            </p>
          </div>
        ) : null}
      </div>
    </div>
  );
};
