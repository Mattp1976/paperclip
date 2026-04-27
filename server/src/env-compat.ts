/**
 * Env var rebrand compatibility shim.
 *
 * The codebase still reads PAPERCLIP_* env vars throughout (~95 sites
 * spanning server, cli, and tests). Renaming every read site is a deep
 * refactor; renaming the var names users SET is a shallow one.
 *
 * This shim runs before any other server code reads process.env, and:
 *   - For every ORQESTRA_X env var that is set, copies it to PAPERCLIP_X
 *     unless PAPERCLIP_X is already explicitly set.
 *   - For every PAPERCLIP_X env var that is set (and ORQESTRA_X is not),
 *     copies it to ORQESTRA_X so future code can prefer the new name.
 *
 * Net effect: callers can use either ORQESTRA_X or PAPERCLIP_X. Existing
 * Railway env vars continue to work without coordination. New deploys
 * can use the ORQESTRA_X spelling.
 *
 * Logged lines emit at startup if any names were mirrored, so users can
 * see the transition happening.
 *
 * Special case: `~/.paperclip` directory fallback is handled in
 * home-paths.ts directly (not here) because it's a filesystem read, not
 * an env read.
 */

export function applyOrqestraEnvCompat(): {
  mirrored: Array<{ from: string; to: string }>;
} {
  const mirrored: Array<{ from: string; to: string }> = [];

  for (const key of Object.keys(process.env)) {
    if (key.startsWith("ORQESTRA_")) {
      const oldName = `PAPERCLIP_${key.slice("ORQESTRA_".length)}`;
      if (process.env[oldName] === undefined && process.env[key] !== undefined) {
        process.env[oldName] = process.env[key];
        mirrored.push({ from: key, to: oldName });
      }
    } else if (key.startsWith("PAPERCLIP_")) {
      const newName = `ORQESTRA_${key.slice("PAPERCLIP_".length)}`;
      if (process.env[newName] === undefined && process.env[key] !== undefined) {
        process.env[newName] = process.env[key];
        mirrored.push({ from: key, to: newName });
      }
    }
  }

  return { mirrored };
}
