import type { FacingMode, PhoneOrientation, QualityMode } from "@/lib/signaling";

/** Same-LAN first: empty ICE list prefers host candidates and keeps latency lowest. */
export const createPeerConnection = (): RTCPeerConnection => {
  return new RTCPeerConnection({
    iceServers: [],
    bundlePolicy: "max-bundle",
    rtcpMuxPolicy: "require",
  });
};

export const getCameraStream = async (
  facingMode: FacingMode,
  orientation?: PhoneOrientation,
  quality: QualityMode = "1080p",
): Promise<MediaStream> => {
  const isLandscape = orientation === "landscape";
  const is1080p = quality === "1080p";

  const targetWidth = is1080p ? 1920 : 1280;
  const targetHeight = is1080p ? 1080 : 720;

  return navigator.mediaDevices.getUserMedia({
    audio: false,
    video: {
      facingMode: { ideal: facingMode },
      width: {
        ideal: isLandscape ? targetWidth : targetHeight,
        max: isLandscape ? targetWidth : targetHeight,
      },
      height: {
        ideal: isLandscape ? targetHeight : targetWidth,
        max: isLandscape ? targetHeight : targetWidth,
      },
      aspectRatio: { ideal: isLandscape ? 16 / 9 : 9 / 16 },
      // Strict 30 FPS prevents phone mobile encoder throttling and packet buffering
      frameRate: { ideal: 30, max: 30 },
    },
  });
};

/**
 * Configure encoder parameters for minimal latency:
 * - "maintain-framerate": NEVER queue old frames; drops/adjusts compression instantly to stay in sync with real-time
 * - Optimized bitrate: 3.5 Mbps for 1080p, 2.0 Mbps for 720p (prevents Wi-Fi router bufferbloat)
 */
export const tuneVideoSender = async (
  peerConnection: RTCPeerConnection,
  quality: QualityMode = "1080p",
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

  const is1080p = quality === "1080p";
  const targetBitrate = is1080p ? 3_500_000 : 2_000_000;

  parameters.encodings[0] = {
    ...parameters.encodings[0],
    maxBitrate: targetBitrate,
    maxFramerate: 30,
    priority: "high",
    networkPriority: "high",
  };

  // Critical for zero lag: instructs WebRTC to discard old frames instead of accumulating playback delay
  (parameters as unknown as { degradationPreference?: string }).degradationPreference =
    "maintain-framerate";

  try {
    await sender.setParameters(parameters);
  } catch (err) {
    console.warn("Could not set sender parameters:", err);
  }
};

/**
 * Prioritize H.264 hardware encoding on mobile GPUs (Apple VideoToolbox / Qualcomm / MediaTek)
 * Hardware H.264 encodes in ~5ms vs software VP8/VP9 which can delay frames by 200-500ms on phones.
 */
export const preferH264Codec = (peerConnection: RTCPeerConnection): void => {
  const transceivers = peerConnection.getTransceivers();
  for (const transceiver of transceivers) {
    if (
      transceiver.receiver.track?.kind === "video" ||
      transceiver.sender.track?.kind === "video"
    ) {
      if (typeof RTCRtpSender.getCapabilities === "function") {
        const capabilities = RTCRtpSender.getCapabilities("video");
        if (capabilities && capabilities.codecs) {
          const h264Codecs = capabilities.codecs.filter(
            (c) => c.mimeType.toLowerCase() === "video/h264",
          );
          const otherCodecs = capabilities.codecs.filter(
            (c) => c.mimeType.toLowerCase() !== "video/h264",
          );

          if (
            h264Codecs.length > 0 &&
            typeof transceiver.setCodecPreferences === "function"
          ) {
            try {
              transceiver.setCodecPreferences([...h264Codecs, ...otherCodecs]);
            } catch (prefErr) {
              console.warn("Could not set H264 codec preference:", prefErr);
            }
          }
        }
      }
    }
  }
};

/**
 * Configure WebRTC receivers to play frames immediately with zero jitter buffer:
 * - playoutDelayHint = 0: removes the standard 200-400ms smoothing buffer in Chromium/WebKit
 * - jitterBufferTarget = 0: W3C standard minimum jitter delay
 */
export const applyLowLatencyToReceivers = (
  peerConnection: RTCPeerConnection,
): void => {
  for (const receiver of peerConnection.getReceivers()) {
    if (receiver.track?.kind === "video") {
      if ("playoutDelayHint" in receiver) {
        (receiver as unknown as { playoutDelayHint: number }).playoutDelayHint = 0;
      }
      if ("jitterBufferTarget" in receiver) {
        (receiver as unknown as { jitterBufferTarget: number }).jitterBufferTarget = 0;
      }
    }
  }
};

export const stopMediaStream = (stream: MediaStream | null): void => {
  if (!stream) {
    return;
  }

  for (const track of stream.getTracks()) {
    track.stop();
  }
};
