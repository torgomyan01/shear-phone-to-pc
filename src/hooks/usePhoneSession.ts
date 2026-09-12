"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Socket } from "socket.io-client";
import {
  SIGNAL_EVENTS,
  type CameraFacingPayload,
  type FacingMode,
  type PhoneOrientation,
  type PhoneOrientationPayload,
  type QualityMode,
  type QualityModePayload,
  type RoomErrorPayload,
  type RoomJoinedPayload,
  type SignalPayload,
} from "@/lib/signaling";
import {
  createPeerConnection,
  getCameraStream,
  preferH264Codec,
  stopMediaStream,
  tuneVideoSender,
} from "@/lib/webrtc";

export type PhoneStatus =
  | "connecting"
  | "ready"
  | "streaming"
  | "ended"
  | "error";

interface UsePhoneSessionResult {
  status: PhoneStatus;
  error: string | null;
  facingMode: FacingMode;
  orientation: PhoneOrientation;
  quality: QualityMode;
  localStream: MediaStream | null;
}

const getPhoneOrientation = (): PhoneOrientation => {
  if (typeof window === "undefined") {
    return "portrait";
  }
  if (window.screen?.orientation?.type) {
    return window.screen.orientation.type.startsWith("landscape")
      ? "landscape"
      : "portrait";
  }
  return window.innerWidth > window.innerHeight ? "landscape" : "portrait";
};

export const usePhoneSession = (
  socket: Socket | null,
  roomId: string,
): UsePhoneSessionResult => {
  const [status, setStatus] = useState<PhoneStatus>("connecting");
  const [error, setError] = useState<string | null>(null);
  const [facingMode, setFacingMode] = useState<FacingMode>("environment");
  const [orientation, setOrientation] = useState<PhoneOrientation>(getPhoneOrientation);
  const [quality, setQuality] = useState<QualityMode>("1080p");
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);

  const peerRef = useRef<RTCPeerConnection | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const facingRef = useRef<FacingMode>("environment");
  const orientationRef = useRef<PhoneOrientation>(getPhoneOrientation());
  const qualityRef = useRef<QualityMode>("1080p");
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);

  const requestWakeLock = useCallback(async () => {
    try {
      if ("wakeLock" in navigator && typeof navigator.wakeLock.request === "function") {
        wakeLockRef.current = await navigator.wakeLock.request("screen");
      }
    } catch {
      // Wake lock request may fail if battery saver is on or user switches tabs
    }
  }, []);

  const releaseWakeLock = useCallback(() => {
    if (wakeLockRef.current) {
      void wakeLockRef.current.release().catch(() => {});
      wakeLockRef.current = null;
    }
  }, []);

  const cleanupPeer = useCallback(() => {
    peerRef.current?.close();
    peerRef.current = null;
  }, []);

  const replaceCamera = useCallback(
    async (
      nextFacing: FacingMode,
      activeSocket: Socket,
      targetOrientation?: PhoneOrientation,
      targetQuality?: QualityMode,
    ) => {
      facingRef.current = nextFacing;
      setFacingMode(nextFacing);
      const orient = targetOrientation ?? orientationRef.current;
      const q = targetQuality ?? qualityRef.current;

      const previous = streamRef.current;
      const nextStream = await getCameraStream(nextFacing, orient, q);
      streamRef.current = nextStream;
      setLocalStream(nextStream);

      const videoTrack = nextStream.getVideoTracks()[0];
      const sender = peerRef.current
        ?.getSenders()
        .find((item) => item.track?.kind === "video");

      if (sender && videoTrack) {
        await sender.replaceTrack(videoTrack);
        if (peerRef.current) {
          await tuneVideoSender(peerRef.current, q);
        }
      } else if (peerRef.current && videoTrack) {
        peerRef.current.addTrack(videoTrack, nextStream);
        preferH264Codec(peerRef.current);
        const offer = await peerRef.current.createOffer();
        await peerRef.current.setLocalDescription(offer);
        activeSocket.emit(SIGNAL_EVENTS.SIGNAL, {
          type: "offer",
          sdp: offer.sdp ?? "",
        } satisfies SignalPayload);
        await tuneVideoSender(peerRef.current, q);
      }

      stopMediaStream(previous);
    },
    [],
  );

  const startStreaming = useCallback(
    async (activeSocket: Socket, initialFacing: FacingMode) => {
      cleanupPeer();

      const orient = orientationRef.current;
      const q = qualityRef.current;
      const stream = await getCameraStream(initialFacing, orient, q);
      streamRef.current = stream;
      setLocalStream(stream);
      facingRef.current = initialFacing;
      setFacingMode(initialFacing);

      const peer = createPeerConnection();
      peerRef.current = peer;

      for (const track of stream.getTracks()) {
        peer.addTrack(track, stream);
      }

      preferH264Codec(peer);

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
        if (peer.connectionState === "connected") {
          setStatus("streaming");
          void requestWakeLock();
        }
      };

      const offer = await peer.createOffer({
        offerToReceiveAudio: false,
        offerToReceiveVideo: false,
      });
      await peer.setLocalDescription(offer);
      activeSocket.emit(SIGNAL_EVENTS.SIGNAL, {
        type: "offer",
        sdp: offer.sdp ?? "",
      } satisfies SignalPayload);
      await tuneVideoSender(peer, q);
      setStatus("streaming");
      void requestWakeLock();
    },
    [cleanupPeer, requestWakeLock],
  );

  useEffect(() => {
    if (!socket) {
      return;
    }

    const reportOrientation = () => {
      const current = getPhoneOrientation();
      const previous = orientationRef.current;
      orientationRef.current = current;
      setOrientation(current);

      socket.emit(SIGNAL_EVENTS.PHONE_ORIENTATION, {
        orientation: current,
      } satisfies PhoneOrientationPayload);

      // If orientation changed while streaming, adjust camera resolution
      if (current !== previous && streamRef.current) {
        const track = streamRef.current.getVideoTracks()[0];
        if (track && typeof track.applyConstraints === "function") {
          const isLandscape = current === "landscape";
          const is1080p = qualityRef.current === "1080p";
          const targetW = is1080p ? 1920 : 1280;
          const targetH = is1080p ? 1080 : 720;
          track
            .applyConstraints({
              width: { ideal: isLandscape ? targetW : targetH },
              height: { ideal: isLandscape ? targetH : targetW },
              aspectRatio: { ideal: isLandscape ? 16 / 9 : 9 / 16 },
              frameRate: { ideal: 30, max: 30 },
            })
            .catch(() => {
              void replaceCamera(facingRef.current, socket, current, qualityRef.current);
            });
        }
      }
    };

    reportOrientation();

    const handleResize = () => reportOrientation();
    const handleOrientationChange = () => reportOrientation();

    window.addEventListener("resize", handleResize);
    window.addEventListener("orientationchange", handleOrientationChange);
    window.screen?.orientation?.addEventListener?.("change", handleOrientationChange);

    const onJoined = (payload: RoomJoinedPayload) => {
      if (payload.role !== "phone") {
        return;
      }
      setStatus("ready");
      reportOrientation();
    };

    const onQuality = (payload: QualityModePayload) => {
      qualityRef.current = payload.quality;
      setQuality(payload.quality);
      if (streamRef.current) {
        void replaceCamera(
          facingRef.current,
          socket,
          orientationRef.current,
          payload.quality,
        );
      }
    };

    const onHostReady = async () => {
      try {
        await startStreaming(socket, facingRef.current);
        reportOrientation();
      } catch (startError) {
        console.error(startError);
        setError(
          "Camera permission is required. Allow camera access and reload.",
        );
        setStatus("error");
      }
    };

    const onError = (payload: RoomErrorPayload) => {
      setError(payload.message);
      setStatus("error");
    };

    const onFacing = (payload: CameraFacingPayload) => {
      facingRef.current = payload.facingMode;
      setFacingMode(payload.facingMode);
    };

    const onSwitch = async (payload: CameraFacingPayload) => {
      try {
        await replaceCamera(
          payload.facingMode,
          socket,
          orientationRef.current,
          qualityRef.current,
        );
      } catch (switchError) {
        console.error(switchError);
        setError("Could not switch camera.");
      }
    };

    const onSignal = async (payload: SignalPayload) => {
      const peer = peerRef.current;
      if (!peer) {
        return;
      }

      try {
        if (payload.type === "answer") {
          await peer.setRemoteDescription({
            type: "answer",
            sdp: payload.sdp,
          });
          return;
        }

        if (payload.type === "ice" && payload.candidate) {
          await peer.addIceCandidate(payload.candidate);
        }
      } catch (signalError) {
        console.error(signalError);
      }
    };

    const onEnded = () => {
      cleanupPeer();
      releaseWakeLock();
      stopMediaStream(streamRef.current);
      streamRef.current = null;
      setLocalStream(null);
      setStatus("ended");
    };

    socket.on(SIGNAL_EVENTS.ROOM_JOINED, onJoined);
    socket.on(SIGNAL_EVENTS.HOST_READY, onHostReady);
    socket.on(SIGNAL_EVENTS.ROOM_ERROR, onError);
    socket.on(SIGNAL_EVENTS.CAMERA_FACING, onFacing);
    socket.on(SIGNAL_EVENTS.CAMERA_SWITCH, onSwitch);
    socket.on(SIGNAL_EVENTS.QUALITY_MODE, onQuality);
    socket.on(SIGNAL_EVENTS.SIGNAL, onSignal);
    socket.on(SIGNAL_EVENTS.SESSION_END, onEnded);
    socket.on(SIGNAL_EVENTS.HOST_LEFT, onEnded);

    socket.emit(SIGNAL_EVENTS.ROOM_JOIN, { roomId, role: "phone" });

    return () => {
      window.removeEventListener("resize", handleResize);
      window.removeEventListener("orientationchange", handleOrientationChange);
      window.screen?.orientation?.removeEventListener?.("change", handleOrientationChange);

      socket.off(SIGNAL_EVENTS.ROOM_JOINED, onJoined);
      socket.off(SIGNAL_EVENTS.HOST_READY, onHostReady);
      socket.off(SIGNAL_EVENTS.ROOM_ERROR, onError);
      socket.off(SIGNAL_EVENTS.CAMERA_FACING, onFacing);
      socket.off(SIGNAL_EVENTS.CAMERA_SWITCH, onSwitch);
      socket.off(SIGNAL_EVENTS.QUALITY_MODE, onQuality);
      socket.off(SIGNAL_EVENTS.SIGNAL, onSignal);
      socket.off(SIGNAL_EVENTS.SESSION_END, onEnded);
      socket.off(SIGNAL_EVENTS.HOST_LEFT, onEnded);
      cleanupPeer();
      releaseWakeLock();
      stopMediaStream(streamRef.current);
      streamRef.current = null;
    };
  }, [cleanupPeer, releaseWakeLock, replaceCamera, roomId, socket, startStreaming]);

  return {
    status,
    error,
    facingMode,
    orientation,
    quality,
    localStream,
  };
};
