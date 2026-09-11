"use client";

import { useEffect, useRef } from "react";
import { usePhoneSession } from "@/hooks/usePhoneSession";
import { useSocket } from "@/hooks/useSocket";

interface PhoneViewProps {
  roomId: string;
}

export const PhoneView = ({ roomId }: PhoneViewProps) => {
  const socket = useSocket();
  const { status, error, facingMode, localStream } = usePhoneSession(
    socket,
    roomId,
  );
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) {
      return;
    }
    video.srcObject = localStream;
  }, [localStream]);

  const message = (() => {
    switch (status) {
      case "connecting":
        return "Connecting to PC…";
      case "ready":
        return "Starting camera…";
      case "streaming":
        return "Streaming to PC";
      case "ended":
        return "Session ended on PC";
      case "error":
        return error ?? "Something went wrong";
      default:
        return "";
    }
  })();

  return (
    <main className="flex min-h-dvh flex-col bg-zinc-950 text-zinc-100">
      <header className="border-b border-zinc-900 px-5 py-4">
        <p className="text-xs uppercase tracking-[0.24em] text-zinc-500">
          Shear
        </p>
        <h1 className="mt-1 text-lg font-medium">Camera bridge</h1>
        <p className="mt-1 font-mono text-sm text-zinc-400">{roomId}</p>
      </header>

      <section className="flex flex-1 flex-col items-center justify-center gap-5 px-5 py-8">
        <div className="aspect-[9/16] w-full max-w-xs overflow-hidden rounded-3xl bg-black">
          <video
            ref={videoRef}
            autoPlay
            muted
            playsInline
            className="h-full w-full object-cover"
          />
        </div>

        <div className="text-center">
          <p className="text-sm text-zinc-200">{message}</p>
          <p className="mt-2 text-xs text-zinc-500">
            Active camera: {facingMode === "environment" ? "Back" : "Front"}
          </p>
          <p className="mt-3 max-w-xs text-xs leading-relaxed text-zinc-600">
            Keep this page open. Camera switching is controlled from the PC.
          </p>
        </div>
      </section>
    </main>
  );
};
