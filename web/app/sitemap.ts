import type { MetadataRoute } from "next";

const SITE = "https://amanah-casper-rwa.vercel.app";
export default function sitemap(): MetadataRoute.Sitemap {
  return ["/", "/dashboard", "/agent", "/connect"].map((p) => ({ url: `${SITE}${p}`, priority: p === "/" ? 1 : 0.8 }));
}
