import type { NetworkInterfaceInfo } from "node:os";

export const getLanIPv4 = (
  interfaces: NodeJS.Dict<NetworkInterfaceInfo[]>,
): string | null => {
  for (const entries of Object.values(interfaces)) {
    if (!entries) {
      continue;
    }

    for (const entry of entries) {
      const family = String(entry.family);
      if ((family === "IPv4" || family === "4") && !entry.internal) {
        return entry.address;
      }
    }
  }

  return null;
};
