"use client";

import { useEffect, useMemo, useState } from "react";
import { io, type Socket } from "socket.io-client";

export const useSocket = (): Socket | null => {
  const [socket, setSocket] = useState<Socket | null>(null);

  const url = useMemo(() => {
    if (typeof window === "undefined") {
      return null;
    }
    return window.location.origin;
  }, []);

  useEffect(() => {
    if (!url) {
      return;
    }

    const instance = io(url, {
      transports: ["websocket"],
      autoConnect: true,
    });

    setSocket(instance);

    return () => {
      instance.disconnect();
      setSocket(null);
    };
  }, [url]);

  return socket;
};
