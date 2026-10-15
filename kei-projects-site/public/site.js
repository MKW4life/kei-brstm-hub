"use strict";

const statsCard = document.getElementById("stats-card");
const statsLink = document.getElementById("stats-link");
const configuredUrl = window.keiProjectsConfig?.courseStatsUrl;

if (statsCard && statsLink && typeof configuredUrl === "string" && configuredUrl.trim()) {
  try {
    const destination = new URL(configuredUrl);
    if (destination.protocol === "https:") {
      statsLink.href = "/stats";
      statsCard.hidden = false;
    }
  } catch {
    // Leave an invalid destination hidden.
  }
}
