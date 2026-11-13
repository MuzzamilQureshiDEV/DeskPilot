import type { MetadataRoute } from "next";

import { COMPETITORS } from "@/lib/marketing/compare";
import { SITE_URL } from "@/lib/site";

export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();
  return [
    { url: `${SITE_URL}/`, lastModified, changeFrequency: "weekly", priority: 1 },
    { url: `${SITE_URL}/compare`, lastModified, changeFrequency: "monthly", priority: 0.7 },
    ...COMPETITORS.map((c) => ({ url: `${SITE_URL}/compare/${c.slug}`, lastModified, changeFrequency: "monthly" as const, priority: 0.7 })),
    { url: `${SITE_URL}/security`, lastModified, changeFrequency: "monthly", priority: 0.5 },
    { url: `${SITE_URL}/privacy`, lastModified, changeFrequency: "monthly", priority: 0.3 },
    { url: `${SITE_URL}/terms`, lastModified, changeFrequency: "monthly", priority: 0.3 },
  ];
}
