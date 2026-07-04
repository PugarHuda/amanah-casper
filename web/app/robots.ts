import type { MetadataRoute } from "next";

// Let crawlers index the public dashboard (helps when the URL is shared/submitted).
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/" },
    sitemap: "https://amanah-casper-rwa.vercel.app/sitemap.xml",
  };
}
