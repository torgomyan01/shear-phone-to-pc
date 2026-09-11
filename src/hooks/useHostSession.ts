"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Socket } from "socket.io-client";
import {
  SIGNAL_EVENTS,
  type CameraFacingPayload,
  type FacingMode,
  type RoomCreatedPayload,
  type RoomErrorPayload,
  type SignalPayload,
} from "@/lib/signaling";
import { createPeerConnection } from "@/lib/webrtc";

export type HostStatus =
  | "connecting"
  | "waiting"
  | "connecting-phone"
  | "live"
  | "error";

interface UseHostSessionResult {
  roomId: string | null;
  joinUrl: string | null;
  status: HostStatus;
  error: string | null;
  facingMode: FacingMode;
  remoteStream: MediaStream | null;
  switchCamera: () => void;
  endSession: () => void;
}

export const useHostSession = (socket: Socket | null): UseHostSessionResult => {
  const [roomId, setRoomId] = useState<string | null>(null);
  const [status, setStatus] = useState<HostStatus>("connecting");
  const [error, setError] = useState<string | null>(null);
  const [facingMode, setFacingMode] = useState<FacingMode>("environment");
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [joinUrl, setJoinUrl] = useState<string | null>(null);

  const peerRef = useRef<RTCPeerConnection | null>(null);

  const cleanupPeer = useCallback(() => {
    peerRef.current?.close();
    peerRef.current = null;
    setRemoteStream(null);
  }, []);

  const ensurePeer = useCallback(
    (activeSocket: Socket): RTCPeerConnection => {
      if (peerRef.current) {
        return peerRef.current;
      }

      const peer = createPeerConnection();
      peerRef.current = peer;

      peer.ontrack = (event) => {
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

    const onSignal = async (payload: SignalPayload) => {
      const peer = ensurePeer(socket);

      try {
        if (payload.type === "offer") {
          await peer.setRemoteDescription({
            type: "offer",
            sdp: payload.sdp,
          });
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
    socket.on(SIGNAL_EVENTS.SIGNAL, onSignal);

    socket.emit(SIGNAL_EVENTS.ROOM_CREATE);

    return () => {
      socket.off(SIGNAL_EVENTS.ROOM_CREATED, onCreated);
      socket.off(SIGNAL_EVENTS.ROOM_ERROR, onError);
      socket.off(SIGNAL_EVENTS.PHONE_JOINED, onPhoneJoined);
      socket.off(SIGNAL_EVENTS.PHONE_LEFT, onPhoneLeft);
      socket.off(SIGNAL_EVENTS.CAMERA_FACING, onFacing);
      socket.off(SIGNAL_EVENTS.SIGNAL, onSignal);
      cleanupPeer();
    };
  }, [cleanupPeer, ensurePeer, socket]);

  const switchCamera = useCallback(() => {
    socket?.emit(SIGNAL_EVENTS.CAMERA_SWITCH);
  }, [socket]);

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
    remoteStream,
    switchCamera,
    endSession,
  };
};
