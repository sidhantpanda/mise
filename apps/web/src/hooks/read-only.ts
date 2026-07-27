import { useMe } from "./auth";

/**
 * Whether the signed-in account has read-only access.
 *
 * This is a rendering hint only — it decides whether write controls appear
 * disabled. The server rejects the writes regardless, so a stale or spoofed
 * `false` here costs nothing but a 403.
 *
 * Defaults to `false` while the session is still loading, so the UI doesn't
 * flash every button disabled on first paint for ordinary users.
 */
export function useIsReadOnly(): boolean {
  const { data } = useMe();
  if (!data) return false;
  // Two independent sources, mirroring requireWriteAuth on the server: a
  // locked-down account, or a Viewer membership in the household on screen.
  if (data.user.isReadOnly) return true;
  const membership = data.household?.members.find((m) => m.id === data.user.id);
  return membership?.role === "Viewer";
}
