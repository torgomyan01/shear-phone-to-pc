"use client";

import { QRCodeSVG } from "qrcode.react";

interface QrPanelProps {
  joinUrl: string | null;
  roomId: string | null;
}

export const QrPanel = ({ joinUrl, roomId }: QrPanelProps) => {
  if (!joinUrl || !roomId) {
    return (
      <div className="rounded-2xl border border-zinc-800 bg-zinc-950/80 p-6 text-sm text-zinc-400">
        Creating session…
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-4 rounded-2xl border border-zinc-800 bg-zinc-950/90 p-5">
      <div className="rounded-xl bg-white p-3">
        <QRCodeSVG value={joinUrl} size={168} level="M" includeMargin={false} />
      </div>
      <div className="text-center">
        <p className="text-xs uppercase tracking-[0.2em] text-zinc-500">
          Scan with phone
        </p>
        <p className="mt-2 font-mono text-lg tracking-widest text-zinc-100">
          {roomId}
        </p>
      </div>
    </div>
  );
};
