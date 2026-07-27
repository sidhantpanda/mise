import { useMe } from "./auth";

/**
 * Whether the signed-in account is a read-only (demo/viewer) one.
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
  return data?.user.isReadOnly ?? false;
}
