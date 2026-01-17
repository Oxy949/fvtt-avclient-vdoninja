import { MODULE_ID } from "./settings.js";

/**
 * MVP AVClient that "fakes" a video stream to make Foundry render camera tiles,
 * then replaces the video element's visuals with an embedded VDO.Ninja viewer iframe.
 */
export class VdoNinjaAVClient extends foundry.av.AVClient {
  constructor(master, settings) {
    super(master, settings);

    this._connected = false;
    this._dummyStream = null;
    /** @type {Map<HTMLVideoElement, {userId: string, host: HTMLDivElement, iframe: HTMLIFrameElement}>} */
    this._embeds = new Map();
  }

  /* -------------------------------------------- */
  /* Foundry lifecycle                            */
  /* -------------------------------------------- */

  async initialize() {
    if (!this._dummyStream) this._dummyStream = this._createDummyStream();
  }

  async connect() {
    this._connected = true;
    if (!this._dummyStream) this._dummyStream = this._createDummyStream();
    return true;
  }

  async disconnect() {
    this._connected = false;
    this._clearAllEmbeds();
    return true;
  }

  /* -------------------------------------------- */
  /* Required AVClient interface                   */
  /* -------------------------------------------- */

  getConnectedUsers() {
    const mapping = this._getStreamMap();
    const selfId = game.user?.id ?? game.userId;
    const ids = new Set([selfId].filter(Boolean));
    for (const [userId, url] of Object.entries(mapping)) {
      if (url) ids.add(userId);
    }
    return Array.from(ids);
  }

  getMediaStreamForUser(userId) {
    const mapping = this._getStreamMap();
    if (!mapping[userId]) return null;
    return this._dummyStream;
  }

  getLevelsStreamForUser(_userId) {
    // MVP: no voice activity / levels (audio isn't routed through Foundry)
    return null;
  }

  isAudioEnabled() {
    // MVP: Foundry isn't capturing or routing local mic.
    return false;
  }

  isVideoEnabled() {
    // MVP: "enabled" only means we want our own camera tile to exist.
    const mapping = this._getStreamMap();
    const selfId = game.user?.id ?? game.userId;
    return Boolean(selfId && mapping[selfId]);
  }

  async toggleAudio(_enabled) {
    // no-op (MVP)
  }

  async toggleVideo(_enabled) {
    // no-op (MVP)
  }

  async toggleBroadcast(_enabled) {
    // no-op (MVP)
  }

  async updateLocalStream() {
    // no-op (MVP) - do not call getUserMedia()
  }

  setUserAudio(_userId, _audioElement) {
    // MVP: audio comes from the iframe, not through Foundry's AV graph.
  }

  async setUserVideo(userId, videoElement) {
    const mapping = this._getStreamMap();
    const url = mapping[userId];

    if (!url) {
      this._detachEmbed(userId, videoElement);
      return;
    }

    const embedUrl = this._buildEmbedUrl(url);
    this._attachEmbed(userId, videoElement, embedUrl);
  }

  /* -------------------------------------------- */
  /* Module helpers                                */
  /* -------------------------------------------- */

  refreshAll() {
    const mapping = this._getStreamMap();

    // Update / remove existing embeds.
    for (const [video, entry] of this._embeds.entries()) {
      const url = mapping[entry.userId];

      // If mapping removed or element gone, detach.
      if (!url || !video?.isConnected || !entry?.host?.isConnected || !entry?.iframe?.isConnected) {
        this._detachEmbed(entry.userId, video);
        continue;
      }

      const nextUrl = this._buildEmbedUrl(url);
      if (entry.iframe.src !== nextUrl) entry.iframe.src = nextUrl;
    }
  }

  _getStreamMap() {
    return game.settings.get(MODULE_ID, "streams") || {};
  }

  _buildEmbedUrl(url) {
    try {
      const u = new URL(url);

      // Make it "embed-friendly" by default.
      // We only set params if they aren't already present.
      if (!u.searchParams.has("cleanoutput")) u.searchParams.set("cleanoutput", "1");
      if (!u.searchParams.has("nocontrols")) u.searchParams.set("nocontrols", "1");
      if (!u.searchParams.has("autostart")) u.searchParams.set("autostart", "1");
      // Helps prevent autoplay restrictions from blocking embedded playback.
      // (Most browsers will happily autoplay muted video, but may block audio without a gesture.)
      if (!u.searchParams.has("noaudio")) u.searchParams.set("noaudio", "1");

      return u.toString();
    } catch {
      // If it's not a valid URL, just try to use it as-is.
      return url;
    }
  }

  _attachEmbed(userId, videoElement, embedUrl, attempt = 0) {
    if (!(videoElement instanceof HTMLVideoElement)) return;

    // In FVTT v13, setUserVideo can happen before the element is attached.
    // Retry briefly until we have a DOM anchor.
    const parent = videoElement.parentElement;
    if (!parent || !videoElement.isConnected) {
      if (attempt < 60) {
        setTimeout(() => this._attachEmbed(userId, videoElement, embedUrl, attempt + 1), 50);
      }
      return;
    }

    // Ensure overlays can position relative to this container.
    const currentPosition = getComputedStyle(parent).position;
    if (currentPosition === "static") parent.style.position = "relative";

    // Keep the original video element in-flow (preserves sizing), but hide it visually.
    videoElement.classList.add("fvtt-avclient-vdoninja-hidden-video");

    let host = parent.querySelector(`.fvtt-avclient-vdoninja-host[data-user-id="${userId}"]`);
    let iframe = host?.querySelector("iframe") ?? null;

    if (!host) {
      host = document.createElement("div");
      host.className = "fvtt-avclient-vdoninja-host";
      host.dataset.userId = userId;

      iframe = document.createElement("iframe");
      iframe.setAttribute("allow", "autoplay; fullscreen; picture-in-picture; camera; microphone");
      iframe.setAttribute("allowfullscreen", "");
      iframe.referrerPolicy = "no-referrer";

      host.appendChild(iframe);
      parent.appendChild(host);
    }

    if (iframe && iframe.src !== embedUrl) iframe.src = embedUrl;

    this._embeds.set(videoElement, { userId, host, iframe });
  }

  _detachEmbed(userId, videoElement) {
    const entry = videoElement ? this._embeds.get(videoElement) : null;

    // Remove host overlay.
    const host = entry?.host
      ?? videoElement?.parentElement?.querySelector(`.fvtt-avclient-vdoninja-host[data-user-id="${userId}"]`)
      ?? null;
    host?.remove();

    // Restore original video visibility.
    if (videoElement instanceof HTMLVideoElement) {
      videoElement.classList.remove("fvtt-avclient-vdoninja-hidden-video");
    }

    if (videoElement) this._embeds.delete(videoElement);
  }

  _clearAllEmbeds() {
    for (const [video, entry] of this._embeds.entries()) {
      this._detachEmbed(entry.userId, video);
    }
    this._embeds.clear();
  }

  _createDummyStream() {
    // A tiny black canvas stream so Foundry thinks a "video track" exists.
    // This avoids browser camera permissions and keeps the UI stable.
    const canvas = document.createElement("canvas");
    canvas.width = 16;
    canvas.height = 16;

    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.fillStyle = "#000";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }

    // 1 FPS is enough; the element is hidden anyway.
    return canvas.captureStream(1);
  }
}
