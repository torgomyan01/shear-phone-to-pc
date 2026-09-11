import { networkInterfaces } from "node:os";
import type { NextConfig } from "next";
import { getLanIPv4 } from "./src/lib/network";

const lanIp = getLanIPv4(networkInterfaces());

const nextConfig: NextConfig = {
  allowedDevOrigins: [
    "localhost",
    "127.0.0.1",
    ...(lanIp ? [lanIp] : []),
  ],
};

export default nextConfig;
