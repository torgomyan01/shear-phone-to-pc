import type { FacingMode } from "@/lib/signaling";

/** Same-LAN first: empty ICE list prefers host candidates and keeps latency low. */
export const createPeerConnection = (): RTCPeerConnection => {
  return new RTCPeerConnection({
    iceServers: [],
    bundlePolicy: "max-bundle",
    rtcpMuxPolicy: "require",
  });
};

export const getCameraStream = async (
  facingMode: FacingMode,
): Promise<MediaStream> => {
  return navigator.mediaDevices.getUserMedia({
    audio: false,
    video: {
      facingMode: { ideal: facingMode },
      width: { ideal: 720 },
      height: { ideal: 1280 },
      frameRate: { ideal: 30, max: 30 },
    },
  });
};

export const tuneVideoSender = async (
  peerConnection: RTCPeerConnection,
): Promise<void> => {
  const sender = peerConnection
    .getSenders()
    .find((item) => item.track?.kind === "video");

  if (!sender) {
    return;
  }

  const parameters = sender.getParameters();
  if (!parameters.encodings || parameters.encodings.length === 0) {
    parameters.encodings = [{}];
  }

  parameters.encodings[0] = {
    ...parameters.encodings[0],
    maxBitrate: 1_500_000,
    maxFramerate: 30,
    priority: "high",
    networkPriority: "high",
  };

  await sender.setParameters(parameters);
};

export const stopMediaStream = (stream: MediaStream | null): void => {
  if (!stream) {
    return;
  }

  for (const track of stream.getTracks()) {
    track.stop();
  }
};
