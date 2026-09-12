"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Socket } from "socket.io-client";
import {
  SIGNAL_EVENTS,
  type CameraFacingPayload,
  type FacingMode,
  type PhoneOrientation,
  type PhoneOrientationPayload,
  type QualityMode,
  type QualityModePayload,
  type RoomCreatedPayload,
  type RoomErrorPayload,
  type SignalPayload,
} from "@/lib/signaling";
import {
  applyLowLatencyToReceivers,
  createPeerConnection,
  preferH264Codec,
} from "@/lib/webrtc";

export type HostStatus =
  | "connecting"
  | "waiting"
  | "connecting-phone"
  | "live"
  | "error";

export type AspectRatioMode = "auto" | "native" | "16:9" | "21:9" | "9:16";
export type EffectiveAspectRatio = "native" | "16:9" | "21:9" | "9:16";
export type FitMode = "contain" | "cover";
export type RotationAngle = 0 | 90 | 180 | 270;

export interface WebRTCStats {
  fps: number;
  bitrateMbps: number;
  rttMs: number;
  jitterMs: number;
}

interface UseHostSessionResult {
  roomId: string | null;
  joinUrl: string | null;
  status: HostStatus;
  error: string | null;
  facingMode: FacingMode;
  phoneOrientation: PhoneOrientation;
  qualityMode: QualityMode;
  aspectRatioMode: AspectRatioMode;
  effectiveAspectRatio: EffectiveAspectRatio;
  fitMode: FitMode;
  rotation: RotationAngle;
  streamDimensions: { width: number; height: number } | null;
  stats: WebRTCStats | null;
  remoteStream: MediaStream | null;
  setQualityMode: (mode: QualityMode) => void;
  setAspectRatioMode: (mode: AspectRatioMode) => void;
  setFitMode: (mode: FitMode) => void;
  toggleFitMode: () => void;
  rotateVideo: () => void;
  resetRotation: () => void;
  setNaturalStreamOrientation: (orientation: PhoneOrientation) => void;
  setStreamDimensions: (dims: { width: number; height: number }) => void;
  switchCamera: () => void;
  endSession: () => void;
}

export const useHostSession = (socket: Socket | null): UseHostSessionResult => {
  const [roomId, setRoomId] = useState<string | null>(null);
  const [status, setStatus] = useState<HostStatus>("connecting");
  const [error, setError] = useState<string | null>(null);
  const [facingMode, setFacingMode] = useState<FacingMode>("environment");
  const [phoneOrientation, setPhoneOrientation] = useState<PhoneOrientation>("portrait");
  const [qualityMode, setQualityModeState] = useState<QualityMode>("1080p");
  const [naturalStreamOrientation, setNaturalStreamOrientation] =
    useState<PhoneOrientation | null>(null);
  const [streamDimensions, setStreamDimensions] = useState<{
    width: number;
    height: number;
  } | null>(null);
  const [aspectRatioMode, setAspectRatioMode] = useState<AspectRatioMode>("auto");
  const [fitMode, setFitMode] = useState<FitMode>("contain");
  const [rotation, setRotation] = useState<RotationAngle>(0);
  const [stats, setStats] = useState<WebRTCStats | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [joinUrl, setJoinUrl] = useState<string | null>(null);

  const peerRef = useRef<RTCPeerConnection | null>(null);
  const prevBytesRef = useRef<{ bytes: number; timestamp: number } | null>(null);

  const cleanupPeer = useCallback(() => {
    peerRef.current?.close();
    peerRef.current = null;
    setRemoteStream(null);
    setNaturalStreamOrientation(null);
    setStreamDimensions(null);
    setStats(null);
    prevBytesRef.current = null;
  }, []);

  const ensurePeer = useCallback(
    (activeSocket: Socket): RTCPeerConnection => {
      if (peerRef.current) {
        return peerRef.current;
      }

      const peer = createPeerConnection();
      peerRef.current = peer;

      peer.ontrack = (event) => {
        if (event.receiver) {
          if ("playoutDelayHint" in event.receiver) {
            (event.receiver as unknown as { playoutDelayHint: number }).playoutDelayHint = 0;
          }
          if ("jitterBufferTarget" in event.receiver) {
            (event.receiver as unknown as { jitterBufferTarget: number }).jitterBufferTarget = 0;
          }
        }
        applyLowLatencyToReceivers(peer);

        const [stream] = event.streams;
        if (stream) {
          setRemoteStream(stream);
          setStatus("live");
        }
      };

      peer.onicecandidate = (event) => {
        if (!event.candidate) {
          return;
        }

        activeSocket.emit(SIGNAL_EVENTS.SIGNAL, {
          type: "ice",
          candidate: event.candidate.toJSON(),
        } satisfies SignalPayload);
      };

      peer.onconnectionstatechange = () => {
        if (
          peer.connectionState === "failed" ||
          peer.connectionState === "disconnected"
        ) {
          setStatus((current) => (current === "live" ? "waiting" : current));
        }
      };

      return peer;
    },
    [],
  );

  useEffect(() => {
    if (!socket) {
      return;
    }

    const onCreated = (payload: RoomCreatedPayload) => {
      setRoomId(payload.roomId);
      setStatus("waiting");
      setJoinUrl(payload.joinUrl);
    };

    const onError = (payload: RoomErrorPayload) => {
      setError(payload.message);
      setStatus("error");
    };

    const onPhoneJoined = () => {
      setStatus("connecting-phone");
      cleanupPeer();
      ensurePeer(socket);
      socket.emit(SIGNAL_EVENTS.HOST_READY);
    };

    const onPhoneLeft = () => {
      cleanupPeer();
      setStatus("waiting");
    };

    const onFacing = (payload: CameraFacingPayload) => {
      setFacingMode(payload.facingMode);
    };

    const onOrientation = (payload: PhoneOrientationPayload) => {
      setPhoneOrientation(payload.orientation);
    };

    const onSignal = async (payload: SignalPayload) => {
      const peer = ensurePeer(socket);

      try {
        if (payload.type === "offer") {
          await peer.setRemoteDescription({
            type: "offer",
            sdp: payload.sdp,
          });
          preferH264Codec(peer);
          applyLowLatencyToReceivers(peer);

          const answer = await peer.createAnswer();
          await peer.setLocalDescription(answer);
          socket.emit(SIGNAL_EVENTS.SIGNAL, {
            type: "answer",
            sdp: answer.sdp ?? "",
          } satisfies SignalPayload);
          return;
        }

        if (payload.type === "answer") {
          await peer.setRemoteDescription({
            type: "answer",
            sdp: payload.sdp,
          });
          applyLowLatencyToReceivers(peer);
          return;
        }

        if (payload.type === "ice" && payload.candidate) {
          await peer.addIceCandidate(payload.candidate);
        }
      } catch (signalError) {
        console.error(signalError);
        setError("Failed to negotiate the video connection.");
        setStatus("error");
      }
    };

    socket.on(SIGNAL_EVENTS.ROOM_CREATED, onCreated);
    socket.on(SIGNAL_EVENTS.ROOM_ERROR, onError);
    socket.on(SIGNAL_EVENTS.PHONE_JOINED, onPhoneJoined);
    socket.on(SIGNAL_EVENTS.PHONE_LEFT, onPhoneLeft);
    socket.on(SIGNAL_EVENTS.CAMERA_FACING, onFacing);
    socket.on(SIGNAL_EVENTS.PHONE_ORIENTATION, onOrientation);
    socket.on(SIGNAL_EVENTS.SIGNAL, onSignal);

    socket.emit(SIGNAL_EVENTS.ROOM_CREATE);

    return () => {
      socket.off(SIGNAL_EVENTS.ROOM_CREATED, onCreated);
      socket.off(SIGNAL_EVENTS.ROOM_ERROR, onError);
      socket.off(SIGNAL_EVENTS.PHONE_JOINED, onPhoneJoined);
      socket.off(SIGNAL_EVENTS.PHONE_LEFT, onPhoneLeft);
      socket.off(SIGNAL_EVENTS.CAMERA_FACING, onFacing);
      socket.off(SIGNAL_EVENTS.PHONE_ORIENTATION, onOrientation);
      socket.off(SIGNAL_EVENTS.SIGNAL, onSignal);
      cleanupPeer();
    };
  }, [cleanupPeer, ensurePeer, socket]);

  // Real-time network & rendering stats monitor
  useEffect(() => {
    if (status !== "live") {
      setStats(null);
      prevBytesRef.current = null;
      return;
    }

    const interval = setInterval(async () => {
      const peer = peerRef.current;
      if (!peer || peer.connectionState !== "connected") {
        return;
      }

      try {
        const reports = await peer.getStats();
        let fps = 0;
        let jitterMs = 0;
        let rttMs = 0;
        let currentBytes = 0;
        let currentTimestamp = 0;

        reports.forEach((report) => {
          if (report.type === "inbound-rtp" && report.kind === "video") {
            fps = Math.round(report.framesPerSecond ?? 0);
            jitterMs = Math.round((report.jitter ?? 0) * 1000);
            currentBytes = report.bytesReceived ?? 0;
            currentTimestamp = report.timestamp ?? Date.now();
          }
          if (report.type === "candidate-pair" && report.state === "succeeded") {
            rttMs = Math.round((report.currentRoundTripTime ?? 0) * 1000);
          }
        });

        let bitrateMbps = 0;
        if (prevBytesRef.current && currentBytes > prevBytesRef.current.bytes) {
          const timeDiffSec =
            (currentTimestamp - prevBytesRef.current.timestamp) / 1000;
          if (timeDiffSec > 0) {
            const bytesDiff = currentBytes - prevBytesRef.current.bytes;
            bitrateMbps = Number(
              ((bytesDiff * 8) / (timeDiffSec * 1_000_000)).toFixed(1),
            );
          }
        }

        if (currentBytes > 0) {
          prevBytesRef.current = {
            bytes: currentBytes,
            timestamp: currentTimestamp,
          };
        }

        setStats({ fps, bitrateMbps, rttMs, jitterMs });
      } catch {
        // ignore stats errors
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [status]);

  const switchCamera = useCallback(() => {
    socket?.emit(SIGNAL_EVENTS.CAMERA_SWITCH);
  }, [socket]);

  const setQualityMode = useCallback(
    (mode: QualityMode) => {
      setQualityModeState(mode);
      socket?.emit(SIGNAL_EVENTS.QUALITY_MODE, {
        quality: mode,
      } satisfies QualityModePayload);
    },
    [socket],
  );

  const rotateVideo = useCallback(() => {
    setRotation((prev) => ((prev + 90) % 360) as RotationAngle);
  }, []);

  const resetRotation = useCallback(() => {
    setRotation(0);
  }, []);

  const toggleFitMode = useCallback(() => {
    setFitMode((prev) => (prev === "contain" ? "cover" : "contain"));
  }, []);

  const effectiveAspectRatio: EffectiveAspectRatio = useMemo(() => {
    if (aspectRatioMode === "native") {
      return "native";
    }
    if (aspectRatioMode === "16:9") {
      return "16:9";
    }
    if (aspectRatioMode === "21:9") {
      return "21:9";
    }
    if (aspectRatioMode === "9:16") {
      return "9:16";
    }
    // auto: choose 16:9 if landscape, 9:16 if portrait
    if (phoneOrientation === "landscape" || naturalStreamOrientation === "landscape") {
      return "16:9";
    }
    return "9:16";
  }, [aspectRatioMode, phoneOrientation, naturalStreamOrientation]);

  const endSession = useCallback(() => {
    socket?.emit(SIGNAL_EVENTS.SESSION_END);
    cleanupPeer();
    setRoomId(null);
    setJoinUrl(null);
    setStatus("connecting");
    socket?.emit(SIGNAL_EVENTS.ROOM_CREATE);
  }, [cleanupPeer, socket]);

  return {
    roomId,
    joinUrl,
    status,
    error,
    facingMode,
    phoneOrientation,
    qualityMode,
    aspectRatioMode,
    effectiveAspectRatio,
    fitMode,
    rotation,
    streamDimensions,
    stats,
    remoteStream,
    setQualityMode,
    setAspectRatioMode,
    setFitMode,
    toggleFitMode,
    rotateVideo,
    resetRotation,
    setNaturalStreamOrientation,
    setStreamDimensions,
    switchCamera,
    endSession,
  };
};
