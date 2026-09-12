"use client";

import { useEffect, useRef, useState } from "react";
import { usePhoneSession } from "@/hooks/usePhoneSession";
import { useSocket } from "@/hooks/useSocket";

interface PhoneViewProps {
  roomId: string;
}

export const PhoneView = ({ roomId }: PhoneViewProps) => {
  const socket = useSocket();
  const { status, error, facingMode, orientation, quality, localStream } =
    usePhoneSession(socket, roomId);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [dimensions, setDimensions] = useState<{
    width: number;
    height: number;
  } | null>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) {
      return;
    }
    video.srcObject = localStream;
  }, [localStream]);

  const handleMetadata = () => {
    const video = videoRef.current;
    if (video && video.videoWidth && video.videoHeight) {
      setDimensions({ width: video.videoWidth, height: video.videoHeight });
    }
  };

  const message = (() => {
    switch (status) {
      case "connecting":
        return "Connecting to PC…";
      case "ready":
        return "Starting camera…";
      case "streaming":
        return "Streaming live to PC (Zero lag)";
      case "ended":
        return "Session ended on PC";
      case "error":
        return error ?? "Something went wrong";
      default:
        return "";
    }
  })();

  const isLandscape = orientation === "landscape";

  return (
    <main className="flex min-h-dvh flex-col bg-zinc-950 text-zinc-100">
      <header className="border-b border-zinc-900 px-5 py-3">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.24em] text-zinc-500">
              Shear
            </p>
            <h1 className="mt-0.5 text-lg font-medium">Camera bridge</h1>
          </div>
          <div className="flex items-center gap-2">
            <span
              className={`inline-block h-2.5 w-2.5 rounded-full ${
                status === "streaming"
                  ? "bg-emerald-500 animate-pulse"
                  : status === "connecting"
                  ? "bg-amber-500"
                  : "bg-zinc-600"
              }`}
            />
            <p className="font-mono text-sm text-zinc-300">{roomId}</p>
          </div>
        </div>
      </header>

      <section className="flex flex-1 flex-col items-center justify-center gap-4 px-4 py-6">
        <div
          className={`overflow-hidden rounded-3xl bg-black border border-zinc-900 transition-all duration-300 ${
            isLandscape
              ? "aspect-video w-full max-w-lg"
              : "aspect-9/16 w-full max-w-xs"
          }`}
        >
          <video
            ref={videoRef}
            autoPlay
            muted
            playsInline
            onLoadedMetadata={handleMetadata}
            onResize={handleMetadata}
            className="h-full w-full object-contain"
          />
        </div>

        <div className="text-center">
          <p className="text-sm font-medium text-zinc-200">{message}</p>
          <div className="mt-2.5 flex flex-wrap items-center justify-center gap-2 text-xs text-zinc-400">
            <span className="rounded-full bg-zinc-900 px-2.5 py-1 border border-zinc-800">
              Camera: {facingMode === "environment" ? "Back" : "Front"}
            </span>
            <span className="rounded-full bg-zinc-900 px-2.5 py-1 border border-zinc-800">
              {isLandscape ? "Landscape" : "Portrait"}
            </span>
            <span className="rounded-full bg-emerald-950/80 px-2.5 py-1 border border-emerald-800/60 font-mono text-emerald-400">
              {quality === "1080p" ? "1080p HD" : "720p Ultra-Fast"}
            </span>
            {dimensions ? (
              <span className="rounded-full bg-zinc-900 px-2.5 py-1 border border-zinc-800 font-mono text-zinc-300">
                {dimensions.width}×{dimensions.height}
              </span>
            ) : null}
          </div>
          <p className="mt-3 max-w-xs text-xs leading-relaxed text-zinc-500">
            Keep this screen awake. Screen lock is prevented automatically for continuous peak performance.
          </p>
        </div>
      </section>
    </main>
  );
};
