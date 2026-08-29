/** @type {import('next').NextConfig} */

// Applied to every response. HSTS is intentionally omitted — Vercel adds it on
// HTTPS deployments, and forcing it would break `npm run dev:https` (self-signed).
const securityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  // The app records the mic; deny every other powerful feature.
  { key: 'Permissions-Policy', value: 'camera=(), geolocation=(), microphone=(self)' },
];

const nextConfig = {
  poweredByHeader: false,
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
  },
};

module.exports = nextConfig;
