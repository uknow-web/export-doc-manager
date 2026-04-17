// ============================================================================
// Vercel Edge Middleware — HTTP Basic Authentication.
// Every request to this app is gated by the Basic-Auth credentials below.
//
// Credentials are read from Vercel environment variables:
//   - BASIC_AUTH_USER  (default: "admin")
//   - BASIC_AUTH_PASS  (required; set in Vercel dashboard)
//
// If BASIC_AUTH_PASS is not set the middleware falls back to an insecure
// default password — deploys should always set BASIC_AUTH_PASS.
// ============================================================================

export const config = {
  // Protect everything except Vercel internal paths and favicon.
  matcher: ['/((?!_vercel|favicon\\.ico).*)'],
};

export default function middleware(request) {
  const USER = process.env.BASIC_AUTH_USER || 'admin';
  const PASS = process.env.BASIC_AUTH_PASS || 'CHANGE_ME';

  const authHeader = request.headers.get('authorization');
  if (authHeader) {
    try {
      const encoded = authHeader.split(' ')[1] || '';
      const decoded = atob(encoded);
      const idx = decoded.indexOf(':');
      const user = decoded.slice(0, idx);
      const pass = decoded.slice(idx + 1);
      if (user === USER && pass === PASS) {
        return; // Authorized — pass through to the static file.
      }
    } catch {
      // fall through to 401
    }
  }

  return new Response('Authentication required.', {
    status: 401,
    headers: {
      'WWW-Authenticate': 'Basic realm="Export Document Manager", charset="UTF-8"',
    },
  });
}
