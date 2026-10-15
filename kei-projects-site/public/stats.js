"use strict";

const configuredUrl = window.keiProjectsConfig?.courseStatsUrl;
if (typeof configuredUrl === "string" && configuredUrl.trim()) {
  try {
    const destination = new URL(configuredUrl);
    if (
      destination.protocol === "https:" &&
      !(destination.origin === window.location.origin && destination.pathname.replace(/\/$/, "") === "/stats")
    ) {
      window.location.replace(destination.href);
    }
  } catch {
    // Keep the navigation back to Kei Projects available.
  }
}
