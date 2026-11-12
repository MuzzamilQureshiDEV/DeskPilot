import type { MetadataRoute } from "next";

import { SITE_URL } from "@/lib/site";

const PRIVATE = ["/api/", "/auth/", "/home", "/inbox", "/approvals", "/escalations", "/train", "/test", "/automation", "/store", "/settings", "/billing"];

export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/", disallow: PRIVATE },
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
