import { MODULE_ID, registerVdoNinjaSettings } from "./settings.js";
import { VdoNinjaAVClient } from "./vdo-ninja-avclient.js";

/**
 * CameraViews (and camera.hbs) will not render a <video> element at all unless
 * game.webrtc.canUserShareVideo(userId) is true.
 *
 * In our MVP, users often keep Foundry video disabled (they are publishing via VDO.Ninja in a separate tab),
 * which would normally prevent the camera tile from existing, meaning our iframe never gets a DOM anchor.
 *
 * To make the tiles render, we extend canUserShareVideo to return true when a VDO.Ninja URL is configured
 * for that user.
 */
function patchCanUserShareVideo() {
  const proto = foundry?.av?.AVMaster?.prototype;
  if (!proto || proto.__fvttVdoNinjaPatched) return;

  const original = proto.canUserShareVideo;
  if (typeof original !== "function") return;

  proto.canUserShareVideo = function (userId) {
    const base = original.call(this, userId);
    if (base) return true;
    try {
      const mapping = game?.settings?.get?.(MODULE_ID, "streams") ?? {};
      return Boolean(mapping?.[userId]);
    } catch {
      return base;
    }
  };

  proto.__fvttVdoNinjaPatched = true;
}

Hooks.once("init", () => {
  registerVdoNinjaSettings();

  patchCanUserShareVideo();

  // Replace the built-in SimplePeer A/V client.
  // Foundry uses CONFIG.WebRTC.clientClass to choose the AVClient implementation.
  CONFIG.WebRTC.clientClass = VdoNinjaAVClient;

  console.log(`${MODULE_ID} | CONFIG.WebRTC.clientClass set to VdoNinjaAVClient`);
});

Hooks.once("ready", async () => {
  // Our client never calls getUserMedia(), so it's safe to auto-connect.
  // This helps ensure camera tiles are created and setUserVideo is invoked.
  try {
    await game.webrtc?.connect?.();
  } catch (err) {
    console.warn(`${MODULE_ID} | Failed to auto-connect A/V`, err);
  }
});
