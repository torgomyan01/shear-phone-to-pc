# Shear — Phone → PC

Low-latency live camera bridge: phone browser streams video to a PC browser for projector display.

## What it does

- Same Wi‑Fi, one phone → one PC
- QR join link
- Video only (no audio)
- Front / back camera (switched from the PC)
- 9:16 frame on a black background

## Run

```bash
npm install
npm run dev
```

Open the **Local** URL printed in the terminal on the PC.

Scan the QR with the phone (same Wi‑Fi). On first open, accept the self-signed HTTPS warning so the camera can start.

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
