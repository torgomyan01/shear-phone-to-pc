export const SIGNAL_EVENTS = {
  ROOM_CREATE: "room:create",
  ROOM_CREATED: "room:created",
  ROOM_JOIN: "room:join",
  ROOM_JOINED: "room:joined",
  ROOM_ERROR: "room:error",
  PHONE_JOINED: "phone:joined",
  PHONE_LEFT: "phone:left",
  HOST_LEFT: "host:left",
  HOST_READY: "host:ready",
  SIGNAL: "signal",
  CAMERA_SWITCH: "camera:switch",
  CAMERA_FACING: "camera:facing",
  PHONE_ORIENTATION: "phone:orientation",
  QUALITY_MODE: "quality:mode",
  SESSION_END: "session:end",
} as const;

export type Role = "host" | "phone";

export type FacingMode = "user" | "environment";

export type PhoneOrientation = "portrait" | "landscape";

export type QualityMode = "1080p" | "720p";

export interface RoomCreatedPayload {
  roomId: string;
  joinUrl: string;
}

export interface RoomJoinPayload {
  roomId: string;
  role: Role;
}

export interface RoomJoinedPayload {
  roomId: string;
  role: Role;
}

export interface RoomErrorPayload {
  message: string;
}

export type SignalPayload =
  | { type: "offer"; sdp: string }
  | { type: "answer"; sdp: string }
  | { type: "ice"; candidate: RTCIceCandidateInit };

export interface CameraFacingPayload {
  facingMode: FacingMode;
}

export interface PhoneOrientationPayload {
  orientation: PhoneOrientation;
}

export interface QualityModePayload {
  quality: QualityMode;
}
