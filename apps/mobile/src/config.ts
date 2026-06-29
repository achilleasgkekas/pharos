// Default Pharos server. Change this to your LAN IP (e.g. http://192.168.10.5:3000)
// or your tunnel URL. The login screen also lets you override it per-session, and
// it's persisted alongside the token.
export const DEFAULT_API_BASE = 'http://192.168.10.5:3000';

export const STORE_KEYS = {
  token: 'pharos_token',
  base: 'pharos_base',
} as const;
