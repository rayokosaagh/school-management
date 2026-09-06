import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // School logos are validated to 2 MB in the upload service. Multipart form
  // data adds its own boundaries and field metadata, so leave a small buffer
  // above that file limit for the Server Action request itself.
  experimental: {
    serverActions: {
      bodySizeLimit: "3mb",
    },
  },
};

export default nextConfig;
