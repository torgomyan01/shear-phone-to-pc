"use client";

import type { HostStatus } from "@/hooks/useHostSession";
import type { FacingMode } from "@/lib/signaling";

interface HostControlsProps {
  status: HostStatus;
  facingMode: FacingMode;
  onSwitchCamera: () => void;
  onEndSession: () => void;
  visible: boolean;
}

const statusLabel = (status: HostStatus): string => {
  switch (status) {
    case "connecting":
      return "Starting…";
    case "waiting":
      return "Scan QR to connect";
    case "connecting-phone":
      return "Phone connected — linking…";
    case "live":
      return "Live";
    case "error":
      return "Error";
    default:
      return status;
  }
};

export const HostControls = ({
  status,
  facingMode,
  onSwitchCamera,
  onEndSession,
  visible,
}: HostControlsProps) => {
  if (!visible) {
    return null;
  }

  const canSwitch = status === "live" || status === "connecting-phone";

  return (
    <div className="pointer-events-auto flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-zinc-800 bg-zinc-950/90 px-4 py-3 backdrop-blur">
      <div>
        <p className="text-xs uppercase tracking-[0.18em] text-zinc-500">
          Status
        </p>
        <p className="mt-1 text-sm text-zinc-100">{statusLabel(status)}</p>
        <p className="mt-1 text-xs text-zinc-500">
          Camera: {facingMode === "environment" ? "Back" : "Front"}
        </p>
      </div>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={onSwitchCamera}
          disabled={!canSwitch}
          className="rounded-xl border border-zinc-700 px-4 py-2 text-sm text-zinc-100 transition enabled:hover:border-zinc-500 enabled:hover:bg-zinc-900 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Switch camera
        </button>
        <button
          type="button"
          onClick={onEndSession}
          className="rounded-xl bg-zinc-100 px-4 py-2 text-sm font-medium text-zinc-950 transition hover:bg-white"
        >
          New session
        </button>
      </div>
    </div>
  );
};
