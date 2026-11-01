import type { FastifyRequest } from 'fastify';
import { ForbiddenError } from './errors.js';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/** Normalizes an origin string, or returns undefined if it is not a real origin (such as "null"). */
const toOrigin = (value: string): string | undefined => {
  try {
    const { origin } = new URL(value);
    return origin === 'null' ? undefined : origin;
  } catch {
    return undefined;
  }
};

/**
 * Blocks cross-site writes, as a second layer under SameSite cookies and JSON-only bodies.
 *
 * Browsers attach `Sec-Fetch-Site` and `Origin` to requests themselves, and a page cannot forge them,
 * so they say reliably where a request came from. Clients that send neither (curl, scripts, servers)
 * are allowed: CSRF only works by riding on a victim's browser and its cookies.
 */
export const createCrossSiteWriteGuard = (allowedOrigins: readonly string[] = []) => {
  const allowed = new Set(allowedOrigins);

  return async (req: FastifyRequest) => {
    if (SAFE_METHODS.has(req.method)) return;

    const originHeader = req.headers.origin;
    const origin = originHeader === undefined ? undefined : toOrigin(originHeader);
    if (origin && allowed.has(origin)) return;

    const fetchSite = req.headers['sec-fetch-site'];
    if (fetchSite !== undefined) {
      // `none` means the user started the request directly, such as from the address bar or a bookmark
      if (fetchSite === 'same-origin' || fetchSite === 'none') return;
      throw new ForbiddenError('Cross-site request blocked');
    }

    // Older browsers send Origin but not Sec-Fetch-Site: it must be this server's own origin
    if (originHeader === undefined) return;
    const ownOrigin = toOrigin(`${req.protocol}://${req.host}`);
    if (!origin || origin !== ownOrigin) throw new ForbiddenError('Cross-site request blocked');
  };
};
