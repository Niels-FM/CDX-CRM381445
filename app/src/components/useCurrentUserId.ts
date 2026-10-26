import { useEffect, useState } from "react";
import { getContext } from "@microsoft/power-apps/app";

export function useCurrentUserId(): string | undefined {
  const [id, setId] = useState<string>();
  useEffect(() => {
    let live = true;
    getContext()
      .then((c) => live && setId(c.user.systemUserId || undefined))
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, []);
  return id;
}
