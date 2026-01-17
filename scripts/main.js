import {
  MODULE_ID,
  STREAMS_MAPPING_SETTING,
  registerVdoNinjaSettings
} from "./settings.js";
import { VdoNinjaAVClient } from "./vdo-ninja-avclient.js";

/**
 * CameraViews (and camera.hbs) will not render a <video> element at all unless
 * game.webrtc.canUserShareVideo(userId) is true.
 *
 * In this module, users may keep Foundry's own camera disabled (they publish via VDO.Ninja
 * in a separate tab), so we extend canUserShareVideo to return true when a VDO.Ninja URL
 * is configured for that user and the user is currently connected.
 */
function patchCanUserShareVideo() {
  const proto = foundry?.av?.AVMaster?.prototype;
  if (!proto || proto.__fvttVdoNinjaPatched) return;

  const original = proto.canUserShareVideo;
  if (typeof original !== "function") return;

  function hasActiveConfiguredStream(userId) {
    try {
      const u = game?.users?.get?.(userId);
      if (!u?.active) return false;
      const mapping = game?.settings?.get?.(MODULE_ID, STREAMS_MAPPING_SETTING) ?? {};
      return Boolean(mapping?.[userId]);
    } catch {
      return false;
    }
  }

  proto.canUserShareVideo = function (userId) {
    const base = original.call(this, userId);
    if (base) return true;
    return hasActiveConfiguredStream(userId);
  };

  proto.__fvttVdoNinjaPatched = true;
}

function refreshDock({ rerenderDock = true } = {}) {
  const client = game.webrtc?.client;
  if (client?.refreshAll) client.refreshAll({ rerenderDock });
}

Hooks.once("init", () => {
  registerVdoNinjaSettings();

  patchCanUserShareVideo();

  // Replace the built-in SimplePeer A/V client.
  // Foundry uses CONFIG.WebRTC.clientClass to choose the AVClient implementation.
  CONFIG.WebRTC.clientClass = VdoNinjaAVClient;

  console.log(`${MODULE_ID} | CONFIG.WebRTC.clientClass set to VdoNinjaAVClient`);
});

// Whenever the camera dock renders, make sure our iframes are present.
Hooks.on("renderCameraViews", () => {
  refreshDock({ rerenderDock: false });
});

// When a user joins/leaves, re-render the dock so tiles are added/removed.
Hooks.on("userConnected", () => {
  window.setTimeout(() => refreshDock({ rerenderDock: true }), 0);
});

Hooks.once("ready", async () => {
  // Our client never calls getUserMedia(), so it's safe to auto-connect.
  try {
    await game.webrtc?.connect?.();
  } catch (err) {
    console.warn(`${MODULE_ID} | Failed to auto-connect A/V`, err);
  }

  // Fix the "first client sees no camera until F5" race: after Foundry is ready,
  // force a dock re-render and then re-apply iframe overlays.
  refreshDock({ rerenderDock: true });
});
