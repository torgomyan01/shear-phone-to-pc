"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Socket } from "socket.io-client";
import {
  SIGNAL_EVENTS,
  type CameraFacingPayload,
  type FacingMode,
  type RoomErrorPayload,
  type RoomJoinedPayload,
  type SignalPayload,
} from "@/lib/signaling";
import {
  createPeerConnection,
  getCameraStream,
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
  localStream: MediaStream | null;
}

export const usePhoneSession = (
  socket: Socket | null,
  roomId: string,
): UsePhoneSessionResult => {
  const [status, setStatus] = useState<PhoneStatus>("connecting");
  const [error, setError] = useState<string | null>(null);
  const [facingMode, setFacingMode] = useState<FacingMode>("environment");
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);

  const peerRef = useRef<RTCPeerConnection | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const facingRef = useRef<FacingMode>("environment");

  const cleanupPeer = useCallback(() => {
    peerRef.current?.close();
    peerRef.current = null;
  }, []);

  const replaceCamera = useCallback(
    async (nextFacing: FacingMode, activeSocket: Socket) => {
      facingRef.current = nextFacing;
      setFacingMode(nextFacing);

      const previous = streamRef.current;
      const nextStream = await getCameraStream(nextFacing);
      streamRef.current = nextStream;
      setLocalStream(nextStream);

      const videoTrack = nextStream.getVideoTracks()[0];
      const sender = peerRef.current
        ?.getSenders()
        .find((item) => item.track?.kind === "video");

      if (sender && videoTrack) {
        await sender.replaceTrack(videoTrack);
      } else if (peerRef.current && videoTrack) {
        peerRef.current.addTrack(videoTrack, nextStream);
        const offer = await peerRef.current.createOffer();
        await peerRef.current.setLocalDescription(offer);
        activeSocket.emit(SIGNAL_EVENTS.SIGNAL, {
          type: "offer",
          sdp: offer.sdp ?? "",
        } satisfies SignalPayload);
        await tuneVideoSender(peerRef.current);
      }

      stopMediaStream(previous);
    },
    [],
  );

  const startStreaming = useCallback(
    async (activeSocket: Socket, initialFacing: FacingMode) => {
      cleanupPeer();

      const stream = await getCameraStream(initialFacing);
      streamRef.current = stream;
      setLocalStream(stream);
      facingRef.current = initialFacing;
      setFacingMode(initialFacing);

      const peer = createPeerConnection();
      peerRef.current = peer;

      for (const track of stream.getTracks()) {
        peer.addTrack(track, stream);
      }

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
      await tuneVideoSender(peer);
      setStatus("streaming");
    },
    [cleanupPeer],
  );

  useEffect(() => {
    if (!socket) {
      return;
    }

    const onJoined = (payload: RoomJoinedPayload) => {
      if (payload.role !== "phone") {
        return;
      }
      setStatus("ready");
    };

    const onHostReady = async () => {
      try {
        await startStreaming(socket, facingRef.current);
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
        await replaceCamera(payload.facingMode, socket);
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
    socket.on(SIGNAL_EVENTS.SIGNAL, onSignal);
    socket.on(SIGNAL_EVENTS.SESSION_END, onEnded);
    socket.on(SIGNAL_EVENTS.HOST_LEFT, onEnded);

    socket.emit(SIGNAL_EVENTS.ROOM_JOIN, { roomId, role: "phone" });

    return () => {
      socket.off(SIGNAL_EVENTS.ROOM_JOINED, onJoined);
      socket.off(SIGNAL_EVENTS.HOST_READY, onHostReady);
      socket.off(SIGNAL_EVENTS.ROOM_ERROR, onError);
      socket.off(SIGNAL_EVENTS.CAMERA_FACING, onFacing);
      socket.off(SIGNAL_EVENTS.CAMERA_SWITCH, onSwitch);
      socket.off(SIGNAL_EVENTS.SIGNAL, onSignal);
      socket.off(SIGNAL_EVENTS.SESSION_END, onEnded);
      socket.off(SIGNAL_EVENTS.HOST_LEFT, onEnded);
      cleanupPeer();
      stopMediaStream(streamRef.current);
      streamRef.current = null;
    };
  }, [cleanupPeer, replaceCamera, roomId, socket, startStreaming]);

  return {
    status,
    error,
    facingMode,
    localStream,
  };
};
