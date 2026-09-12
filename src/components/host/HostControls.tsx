"use client";

import type {
  AspectRatioMode,
  EffectiveAspectRatio,
  FitMode,
  HostStatus,
  RotationAngle,
  WebRTCStats,
} from "@/hooks/useHostSession";
import type { FacingMode, PhoneOrientation, QualityMode } from "@/lib/signaling";

interface HostControlsProps {
  status: HostStatus;
  facingMode: FacingMode;
  phoneOrientation: PhoneOrientation;
  qualityMode: QualityMode;
  aspectRatioMode: AspectRatioMode;
  effectiveAspectRatio: EffectiveAspectRatio;
  fitMode: FitMode;
  rotation: RotationAngle;
  streamDimensions: { width: number; height: number } | null;
  stats: WebRTCStats | null;
  onSetQualityMode: (mode: QualityMode) => void;
  onSetAspectRatioMode: (mode: AspectRatioMode) => void;
  onSetFitMode: (mode: FitMode) => void;
  onRotateVideo: () => void;
  onResetRotation: () => void;
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
      return "Live (Ուղիղ եթեր)";
    case "error":
      return "Error";
    default:
      return status;
  }
};

export const HostControls = ({
  status,
  facingMode,
  phoneOrientation,
  qualityMode,
  aspectRatioMode,
  effectiveAspectRatio,
  fitMode,
  rotation,
  streamDimensions,
  stats,
  onSetQualityMode,
  onSetAspectRatioMode,
  onSetFitMode,
  onRotateVideo,
  onResetRotation,
  onSwitchCamera,
  onEndSession,
  visible,
}: HostControlsProps) => {
  if (!visible) {
    return null;
  }

  const isLive = status === "live" || status === "connecting-phone";

  return (
    <div className="pointer-events-auto flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-zinc-800 bg-zinc-950/95 p-3.5 backdrop-blur shadow-2xl">
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-2">
          <p className="text-xs uppercase tracking-[0.18em] text-zinc-500">
            Status
          </p>
          <span
            className={`inline-block h-2 w-2 rounded-full ${
              status === "live"
                ? "bg-emerald-500"
                : status === "connecting-phone"
                ? "bg-amber-500 animate-pulse"
                : "bg-zinc-600"
            }`}
          />
          <p className="text-sm font-medium text-zinc-100">{statusLabel(status)}</p>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-400">
          <span>Camera: {facingMode === "environment" ? "Back" : "Front"}</span>
          <span>•</span>
          <span>Phone: {phoneOrientation === "landscape" ? "Horizontal" : "Vertical"}</span>
          {streamDimensions ? (
            <>
              <span>•</span>
              <span className="font-mono text-zinc-300">
                {streamDimensions.width}×{streamDimensions.height}
              </span>
            </>
          ) : null}
          {stats ? (
            <>
              <span>•</span>
              <span className="inline-flex items-center gap-1 rounded bg-emerald-950/80 px-2 py-0.5 font-mono text-[11px] text-emerald-400 border border-emerald-800/60">
                <span>⚡ {stats.rttMs > 0 ? `${stats.rttMs}ms ping` : "Direct LAN"}</span>
                <span>|</span>
                <span>{stats.fps} fps</span>
                {stats.bitrateMbps > 0 ? (
                  <>
                    <span>|</span>
                    <span>{stats.bitrateMbps} Mbps</span>
                  </>
                ) : null}
              </span>
            </>
          ) : null}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {/* Speed / Quality Profile Selector */}
        <div className="flex items-center rounded-xl border border-zinc-800 bg-zinc-900/80 p-0.5 text-xs">
          <button
            type="button"
            onClick={() => onSetQualityMode("1080p")}
            className={`rounded-lg px-2.5 py-1.5 transition ${
              qualityMode === "1080p"
                ? "bg-zinc-100 font-medium text-zinc-950 shadow-sm"
                : "text-zinc-400 hover:text-zinc-200"
            }`}
            title="1080p: High definition stream at low latency (3.5 Mbps)"
          >
            1080p (Հստակ)
          </button>
          <button
            type="button"
            onClick={() => onSetQualityMode("720p")}
            className={`rounded-lg px-2.5 py-1.5 transition ${
              qualityMode === "720p"
                ? "bg-emerald-500 font-medium text-zinc-950 shadow-sm"
                : "text-zinc-400 hover:text-zinc-200"
            }`}
            title="720p Ultra-Low Latency: Fastest transmission, lowest Wi-Fi load (2.0 Mbps)"
          >
            720p (Գերարագ)
          </button>
        </div>

        {/* Fit vs Cover (No crop vs Fill) */}
        <div className="flex items-center rounded-xl border border-zinc-800 bg-zinc-900/80 p-0.5 text-xs">
          <button
            type="button"
            onClick={() => onSetFitMode("contain")}
            className={`rounded-lg px-2.5 py-1.5 transition ${
              fitMode === "contain"
                ? "bg-zinc-100 font-medium text-zinc-950 shadow-sm"
                : "text-zinc-400 hover:text-zinc-200"
            }`}
            title="Full view: 100% of camera capture visible, no cropping"
          >
            Fit (Ամբողջական)
          </button>
          <button
            type="button"
            onClick={() => onSetFitMode("cover")}
            className={`rounded-lg px-2.5 py-1.5 transition ${
              fitMode === "cover"
                ? "bg-zinc-100 font-medium text-zinc-950 shadow-sm"
                : "text-zinc-400 hover:text-zinc-200"
            }`}
            title="Crop & Fill: fills entire selected frame"
          >
            Crop (Լցնել)
          </button>
        </div>

        {/* Aspect Ratio Selector */}
        <div className="flex items-center rounded-xl border border-zinc-800 bg-zinc-900/80 p-0.5 text-xs">
          <button
            type="button"
            onClick={() => onSetAspectRatioMode("auto")}
            className={`rounded-lg px-2.5 py-1.5 transition ${
              aspectRatioMode === "auto"
                ? "bg-zinc-100 font-medium text-zinc-950 shadow-sm"
                : "text-zinc-400 hover:text-zinc-200"
            }`}
            title="Auto detect aspect ratio"
          >
            Auto ({effectiveAspectRatio})
          </button>
          <button
            type="button"
            onClick={() => onSetAspectRatioMode("native")}
            className={`rounded-lg px-2.5 py-1.5 transition ${
              aspectRatioMode === "native"
                ? "bg-zinc-100 font-medium text-zinc-950 shadow-sm"
                : "text-zinc-400 hover:text-zinc-200"
            }`}
            title="Native: matches camera sensor aspect ratio exactly (no cropping)"
          >
            Native
          </button>
          <button
            type="button"
            onClick={() => onSetAspectRatioMode("16:9")}
            className={`rounded-lg px-2.5 py-1.5 transition ${
              aspectRatioMode === "16:9"
                ? "bg-zinc-100 font-medium text-zinc-950 shadow-sm"
                : "text-zinc-400 hover:text-zinc-200"
            }`}
            title="Standard widescreen (1920x1080)"
          >
            16:9
          </button>
          <button
            type="button"
            onClick={() => onSetAspectRatioMode("21:9")}
            className={`rounded-lg px-2.5 py-1.5 transition ${
              aspectRatioMode === "21:9"
                ? "bg-zinc-100 font-medium text-zinc-950 shadow-sm"
                : "text-zinc-400 hover:text-zinc-200"
            }`}
            title="Cinema Ultra-wide (21:9)"
          >
            21:9
          </button>
          <button
            type="button"
            onClick={() => onSetAspectRatioMode("9:16")}
            className={`rounded-lg px-2.5 py-1.5 transition ${
              aspectRatioMode === "9:16"
                ? "bg-zinc-100 font-medium text-zinc-950 shadow-sm"
                : "text-zinc-400 hover:text-zinc-200"
            }`}
            title="Vertical (9:16)"
          >
            9:16
          </button>
        </div>

        {/* Rotation 90° button */}
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={onRotateVideo}
            disabled={!isLive}
            className="flex items-center gap-1.5 rounded-xl border border-zinc-700 px-3 py-1.5 text-xs text-zinc-200 transition enabled:hover:border-zinc-500 enabled:hover:bg-zinc-900 disabled:cursor-not-allowed disabled:opacity-40"
            title="Rotate video by 90 degrees"
          >
            <span>Rotate 90°</span>
            {rotation !== 0 ? (
              <span className="font-mono text-zinc-400">({rotation}°)</span>
            ) : null}
          </button>
          {rotation !== 0 ? (
            <button
              type="button"
              onClick={onResetRotation}
              className="rounded-lg border border-zinc-800 px-2 py-1.5 text-xs text-zinc-400 hover:text-zinc-200"
              title="Reset rotation to 0°"
            >
              Reset
            </button>
          ) : null}
        </div>
      </div>

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onSwitchCamera}
          disabled={!isLive}
          className="rounded-xl border border-zinc-700 px-3.5 py-2 text-sm text-zinc-100 transition enabled:hover:border-zinc-500 enabled:hover:bg-zinc-900 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Switch camera
        </button>
        <button
          type="button"
          onClick={onEndSession}
          className="rounded-xl bg-zinc-100 px-3.5 py-2 text-sm font-medium text-zinc-950 transition hover:bg-white"
        >
          New session
        </button>
      </div>
    </div>
  );
};
