import type { MetadataRoute } from "next";

// WHY: a private operations app — nothing should be crawled or indexed.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      disallow: "/",
    },
  };
}
