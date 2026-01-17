import { MODULE_ID, STREAMS_MAPPING_SETTING } from "./settings.js";

/**
 * VDO.Ninja-backed AVClient.
 *
 * This client does not request camera/mic devices. Instead, it renders an <iframe>
 * into the Foundry camera dock for each configured user.
 */
export class VdoNinjaAVClient extends foundry.av.AVClient {
  constructor(master, settings) {
    super(master, settings);

    /** @type {boolean} */
    this.connected = false;

    /** @type {boolean} */
    this._initialized = false;

    /** @type {MediaStream|null} */
    this.dummyStream = null;

    /** @type {Map<string, number>} */
    this._ensureTimers = new Map();
  }

  /* -------------------------------------------- */
  /*  Lifecycle                                   */
  /* -------------------------------------------- */

  async initialize() {
    if (this._initialized) return;
    this._initialized = true;

    // A tiny, empty MediaStream satisfies Foundry's camera dock expectations.
    // Some browsers require at least one track to "play". We create a muted,
    // 1x1 canvas capture track for maximum compatibility.
    try {
      const canvas = document.createElement("canvas");
      canvas.width = 1;
      canvas.height = 1;
      const ctx = canvas.getContext("2d");
      if (ctx) ctx.fillRect(0, 0, 1, 1);
      const stream = canvas.captureStream?.(1) ?? new MediaStream();

      // Ensure at least one track exists.
      if (stream.getTracks().length === 0) {
        this.dummyStream = new MediaStream();
      } else {
        // Mute the track to avoid any weirdness.
        for (const t of stream.getTracks()) t.enabled = false;
        this.dummyStream = stream;
      }
    } catch {
      this.dummyStream = new MediaStream();
    }

    // Register ourselves as the "local stream" so downstream UI pieces do not
    // treat us as uninitialized.
    try {
      this.master?.setLocalStream?.(this.dummyStream);
    } catch {
      // ignore
    }
  }

  async connect() {
    await this.initialize();
    this.connected = true;

    // Force a dock refresh. This fixes the "first client joins and sees no camera
    // tile until F5" race by ensuring the dock renders after settings are readable.
    await this.refreshAll({ rerenderDock: true });
    return true;
  }

  async disconnect() {
    this.connected = false;

    // Clean up any embeds we own.
    await this.refreshAll({ rerenderDock: true });
    return true;
  }

  /**
   * Called by AVMaster when core AV settings change.
   * We do not use core device settings, but a refresh is cheap and keeps the dock consistent.
   */
  async onSettingsChanged(_changed) {
    this.refreshAll();
    return true;
  }

  /* -------------------------------------------- */
  /*  Streams + Visibility                         */
  /* -------------------------------------------- */

  _getStreamsMappingSafe() {
    try {
      return game?.settings?.get?.(MODULE_ID, STREAMS_MAPPING_SETTING) ?? {};
    } catch {
      return {};
    }
  }

  _isUserActive(userId) {
    try {
      return Boolean(game?.users?.get?.(userId)?.active);
    } catch {
      return false;
    }
  }

  /**
   * A user is "stream-enabled" if:
   * - the world has a VDO.Ninja URL configured for them
   * - they are currently connected to the world
   */
  _getStreamUrl(userId) {
    const mapping = this._getStreamsMappingSafe();
    const url = mapping?.[userId];
    if (!url) return null;
    if (!this._isUserActive(userId)) return null;
    return String(url);
  }

  /* -------------------------------------------- */
  /*  Required AVClient API                        */
  /* -------------------------------------------- */

  getConnectedUsers() {
    const mapping = this._getStreamsMappingSafe();
    return Object.keys(mapping).filter((userId) => this._isUserActive(userId));
  }

  getMediaStreamForUser(userId) {
    const url = this._getStreamUrl(userId);
    if (!url) return null;
    return this.dummyStream;
  }

  getLevelsStreamForUser(userId) {
    return this.getMediaStreamForUser(userId);
  }

  isAudioEnabled(_userId) {
    return false;
  }

  isVideoEnabled(userId) {
    return Boolean(this._getStreamUrl(userId));
  }

  // Device enums are unused.
  getAudioSources() {
    return [];
  }
  getVideoSources() {
    return [];
  }
  getAudioSinks() {
    return [];
  }

  async toggleAudio(_userId, _enabled) {
    return false;
  }

  async toggleBroadcast(_intent) {
    return false;
  }

  async toggleVideo(_userId, _enabled) {
    // Video is managed by the world setting (streams mapping), not by Foundry toggles.
    return false;
  }

  async updateLocalStream() {
    // No-op.
    return;
  }

  /* -------------------------------------------- */
  /*  Camera Dock Integration                      */
  /* -------------------------------------------- */

  _iframeUrl(streamUrl, viewId) {
    const joiner = streamUrl.includes("?") ? "&" : "?";
    return `${streamUrl}${joiner}view=${encodeURIComponent(viewId)}&cleanoutput=1&nobg=1&noheader=1`;
  }

  _getUserCameraView(userId) {
    try {
      const app = ui?.webrtc;
      if (app?.getUserCameraView) return app.getUserCameraView(userId);
    } catch {
      // ignore
    }

    return (
      document.querySelector(`.camera-view[data-user-id="${userId}"]`) ||
      document.querySelector(`[data-user-id="${userId}"] .camera-view`) ||
      null
    );
  }

  _getUserVideoElement(userId) {
    try {
      const app = ui?.webrtc;
      if (app?.getUserVideoElement) return app.getUserVideoElement(userId);
    } catch {
      // ignore
    }

    const view = this._getUserCameraView(userId);
    if (!view) return null;
    return view.querySelector("video") || null;
  }

  _removeEmbedFromView(view) {
    if (!view) return;

    // Remove iframe wrapper.
    const wrapper = view.querySelector(".fvtt-vdo-iframe-wrapper");
    if (wrapper) wrapper.remove();

    // Clear the video element stream (it will be our dummy stream).
    const video = view.querySelector("video");
    if (video) {
      try {
        video.pause?.();
      } catch {
        // ignore
      }
      video.srcObject = null;
    }
  }

  _ensureEmbedInView({ view, userId, streamUrl }) {
    if (!view) return;

    // Prefer to insert the iframe wrapper inside the per-user `.video-container`
    // so it overlays the actual video element and not the entire tile chrome.
    const container = view.querySelector(".video-container") || view;

    let wrapper = container.querySelector(".fvtt-vdo-iframe-wrapper");
    if (!wrapper) {
      wrapper = document.createElement("div");
      wrapper.className = "fvtt-vdo-iframe-wrapper";
      wrapper.style.position = "absolute";
      wrapper.style.inset = "0";
      wrapper.style.pointerEvents = "none";
      wrapper.style.display = "block";
      container.style.position = container.style.position || "relative";
      container.appendChild(wrapper);
    }

    let iframe = wrapper.querySelector("iframe");
    if (!iframe) {
      iframe = document.createElement("iframe");
      iframe.className = "fvtt-vdo-iframe";
      iframe.allow = "autoplay; fullscreen";
      iframe.style.width = "100%";
      iframe.style.height = "100%";
      iframe.style.border = "0";
      iframe.style.pointerEvents = "none";
      wrapper.appendChild(iframe);
    }

    const desiredSrc = this._iframeUrl(streamUrl, userId);
    if (iframe.src !== desiredSrc) iframe.src = desiredSrc;
  }

  _scheduleEnsureUserEmbed(userId, attempts = 60) {
    if (this._ensureTimers.has(userId)) return;

    const tick = async () => {
      const url = this._getStreamUrl(userId);
      if (!url) {
        this._ensureTimers.delete(userId);
        return;
      }

      const video = this._getUserVideoElement(userId);
      if (video) {
        await this.setUserVideo(userId, video, this.dummyStream);
        this._ensureTimers.delete(userId);
        return;
      }

      attempts -= 1;
      if (attempts <= 0) {
        this._ensureTimers.delete(userId);
        return;
      }

      const handle = window.setTimeout(tick, 100);
      this._ensureTimers.set(userId, handle);
    };

    const handle = window.setTimeout(tick, 0);
    this._ensureTimers.set(userId, handle);
  }

  /**
   * Foundry calls this whenever it wants the client's stream attached to a docked video.
   * We attach our dummy stream and then overlay the VDO.Ninja iframe.
   */
  async setUserVideo(userId, videoElement, srcObject) {
    const streamUrl = this._getStreamUrl(userId);

    // If no configured stream (or user disconnected), ensure we remove our embed.
    if (!streamUrl || !videoElement) {
      const view = this._getUserCameraView(userId);
      if (view) this._removeEmbedFromView(view);
      if (videoElement) videoElement.srcObject = null;
      return;
    }

    // Attach a dummy stream so Foundry treats the video element as active.
    try {
      videoElement.srcObject = srcObject ?? this.dummyStream;
      await videoElement.play?.().catch(() => undefined);
    } catch {
      // ignore
    }

    // Place iframe overlay in the camera view container.
    const view =
      videoElement.closest?.(".camera-view") ||
      this._getUserCameraView(userId) ||
      videoElement.parentElement;

    this._ensureEmbedInView({ view, userId, streamUrl });
  }

  /**
   * Refresh the camera dock embeds.
   * - Optionally forces a dock re-render so user tiles are added/removed.
   * - Ensures each visible user view has the correct iframe.
   */
  async refreshAll({ rerenderDock = false } = {}) {
    // If we are not connected, we still may want to cleanup embeds.
    const mapping = this._getStreamsMappingSafe();
    const desiredUsers = new Set(this.getConnectedUsers());

    if (rerenderDock) {
      try {
        if (ui?.webrtc?.render) await ui.webrtc.render(true);
      } catch {
        // ignore
      }

      // Let DOM settle.
      await new Promise((r) => window.setTimeout(r, 0));
    }

    // Update existing views.
    const views = document.querySelectorAll(".camera-view[data-user-id]");
    for (const view of views) {
      const userId = view.dataset.userId;
      const streamUrl = mapping?.[userId];

      if (this.connected && desiredUsers.has(userId) && streamUrl) {
        this._ensureEmbedInView({ view, userId, streamUrl });

        // Make sure the underlying video has a dummy stream.
        const video = view.querySelector("video");
        if (video && !video.srcObject) {
          try {
            video.srcObject = this.dummyStream;
            await video.play?.().catch(() => undefined);
          } catch {
            // ignore
          }
        }
      } else {
        this._removeEmbedFromView(view);
      }
    }

    // Ensure any desired user that does not yet have a video element gets handled shortly.
    if (this.connected) {
      for (const userId of desiredUsers) {
        this._scheduleEnsureUserEmbed(userId);
      }
    }
  }
}
