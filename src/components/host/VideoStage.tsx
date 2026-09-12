"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type {
  EffectiveAspectRatio,
  FitMode,
  RotationAngle,
} from "@/hooks/useHostSession";
import type { PhoneOrientation } from "@/lib/signaling";

interface VideoStageProps {
  stream: MediaStream | null;
  effectiveAspectRatio: EffectiveAspectRatio;
  fitMode: FitMode;
  rotation: RotationAngle;
  streamDimensions: { width: number; height: number } | null;
  onNaturalStreamOrientationChange?: (orientation: PhoneOrientation) => void;
  onStreamDimensionsChange?: (dims: { width: number; height: number }) => void;
}

export const VideoStage = ({
  stream,
  effectiveAspectRatio,
  fitMode,
  rotation,
  streamDimensions,
  onNaturalStreamOrientationChange,
  onStreamDimensionsChange,
}: VideoStageProps) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [containerSize, setContainerSize] = useState<{
    width: number;
    height: number;
  } | null>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) {
      return;
    }

    video.srcObject = stream;
  }, [stream]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setContainerSize({
          width: entry.contentRect.width,
          height: entry.contentRect.height,
        });
      }
    });

    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  const handleMetadata = () => {
    const video = videoRef.current;
    if (!video || !video.videoWidth || !video.videoHeight) {
      return;
    }

    const width = video.videoWidth;
    const height = video.videoHeight;
    onStreamDimensionsChange?.({ width, height });

    const detected: PhoneOrientation =
      width > height ? "landscape" : "portrait";
    onNaturalStreamOrientationChange?.(detected);
  };

  const ratio = useMemo(() => {
    if (effectiveAspectRatio === "21:9") {
      return 21 / 9;
    }
    if (effectiveAspectRatio === "16:9") {
      return 16 / 9;
    }
    if (effectiveAspectRatio === "9:16") {
      return 9 / 16;
    }
    if (streamDimensions && streamDimensions.width && streamDimensions.height) {
      return streamDimensions.width / streamDimensions.height;
    }
    return 16 / 9;
  }, [effectiveAspectRatio, streamDimensions]);

  const isSwapped = rotation === 90 || rotation === 270;

  return (
    <div className="relative flex h-full w-full items-center justify-center overflow-hidden bg-black select-none">
      <div
        ref={containerRef}
        className="relative flex items-center justify-center overflow-hidden bg-black transition-all duration-300"
        style={{
          width: `min(100vw, calc(100vh * ${ratio}))`,
          height: `min(100vh, calc(100vw / ${ratio}))`,
          aspectRatio: `${ratio}`,
        }}
      >
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          onLoadedMetadata={handleMetadata}
          onResize={handleMetadata}
          className="transition-transform duration-300 will-change-transform"
          style={{
            width: isSwapped && containerSize ? `${containerSize.height}px` : "100%",
            height: isSwapped && containerSize ? `${containerSize.width}px` : "100%",
            objectFit: fitMode,
            transform: rotation !== 0 ? `rotate(${rotation}deg)` : undefined,
            transformOrigin: "center center",
          }}
        />

        {!stream ? (
          <div className="absolute inset-0 flex items-center justify-center bg-black">
            <p className="px-6 text-center text-sm tracking-wide text-zinc-500">
              Waiting for phone camera…
            </p>
          </div>
        ) : null}

        {rotation !== 0 ? (
          <div className="pointer-events-none absolute bottom-3 right-3 rounded-md bg-black/60 px-2 py-1 text-[11px] font-mono text-zinc-400 backdrop-blur">
            {rotation}°
          </div>
        ) : null}
      </div>
    </div>
  );
};
