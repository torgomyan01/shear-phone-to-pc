# Shear — Phone → PC

Low-latency live camera bridge: phone browser streams video to a PC browser for projector display.

## What it does

- Same Wi‑Fi, one phone → one PC
- High quality local WebRTC stream (1080p, up to 8 Mbps bitrate, resolution-first priority)
- QR join link with automatic local Wi‑Fi IP
- Video only (no audio)
- Front / back camera (switched from the PC)
- **Automatic orientation detection**:
  - Horizontal phone → **21:9 cinematic ultra-wide**
  - Vertical phone → **9:16 vertical**
- **PC Controls**:
  - Format buttons: `Auto`, `21:9`, `9:16`
  - Software 90° rotation button: `0°`, `90°`, `180°`, `270°`
  - Switch camera (Back / Front)
  - Pure black background around the active frame (ideal for projectors)

## Run

```bash
npm install
npm run dev
```

Open the **Local** URL printed in the terminal on the PC (`https://localhost:3000`).

Scan the QR code with the phone (must be on the same Wi‑Fi). On first open, accept the self-signed HTTPS warning so the camera can start.

### Production

```bash
npm run build
npm start
```

### HTTP only (camera will fail on phone LAN IP)

```bash
set DISABLE_HTTPS=1
npm run dev
```

## Notes

- HTTPS is required for camera access on a LAN IP (not localhost).
- Firewall must allow inbound TCP on port `3000`.
- Keep the phone page open while streaming.
