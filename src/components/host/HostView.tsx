"use client";

import { useEffect, useState } from "react";
import { HostControls } from "@/components/host/HostControls";
import { QrPanel } from "@/components/host/QrPanel";
import { VideoStage } from "@/components/host/VideoStage";
import { useHostSession } from "@/hooks/useHostSession";
import { useSocket } from "@/hooks/useSocket";

export const HostView = () => {
  const socket = useSocket();
  const session = useHostSession(socket);
  const [showChrome, setShowChrome] = useState(true);

  useEffect(() => {
    if (session.status !== "live") {
      setShowChrome(true);
      return;
    }

    const timer = window.setTimeout(() => setShowChrome(false), 2500);
    return () => window.clearTimeout(timer);
  }, [session.status]);

  return (
    <main
      className="relative h-dvh w-dvw overflow-hidden bg-black text-zinc-100"
      onMouseMove={() => setShowChrome(true)}
      onClick={() => setShowChrome(true)}
    >
      <VideoStage stream={session.remoteStream} />

      <div
        className={`pointer-events-none absolute inset-0 flex flex-col justify-between p-5 transition-opacity duration-300 ${
          showChrome ? "opacity-100" : "opacity-0"
        }`}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.28em] text-zinc-500">
              Shear
            </p>
            <h1 className="mt-2 text-2xl font-medium tracking-tight text-white">
              Phone → PC
            </h1>
          </div>
          {session.status !== "live" ? (
            <div className="pointer-events-auto">
              <QrPanel joinUrl={session.joinUrl} roomId={session.roomId} />
            </div>
          ) : null}
        </div>

        <HostControls
          status={session.status}
          facingMode={session.facingMode}
          onSwitchCamera={session.switchCamera}
          onEndSession={session.endSession}
          visible={showChrome}
        />
      </div>

      {session.error ? (
        <div className="absolute bottom-24 left-1/2 max-w-md -translate-x-1/2 rounded-xl border border-red-900/60 bg-red-950/80 px-4 py-3 text-center text-sm text-red-100">
          {session.error}
        </div>
      ) : null}
    </main>
  );
};
