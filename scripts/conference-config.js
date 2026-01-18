/**
 * Conference-mode switcher UI for Foundry's built-in A/V settings.
 *
 * Provides a GM-facing menu entry inside this module's settings.
 * Updates whichever core setting object contains the `mode` field (rtcWorldSettings / rtcClientSettings, etc.)
 * while preserving all other properties.
 */

// Avoid circular imports by keeping the module id literal here.
const MODULE_ID = "fvtt-avclient-vdoninja";

function getAVSettingsClass() {
  return foundry?.av?.AVSettings ?? globalThis.AVSettings ?? null;
}

function getAVModesEnum() {
  const cls = getAVSettingsClass();
  return cls?.AV_MODES ?? null;
}

function labelForMode(mode, AV_MODES) {
  if (!AV_MODES) return String(mode);
  switch (mode) {
    case AV_MODES.DISABLED:
      return "Выключено";
    case AV_MODES.VIDEO:
      return "Только видео";
    case AV_MODES.AUDIO_VIDEO:
      return "Видео + аудио";
    default:
      return String(mode);
  }
}

function discoverCandidates() {
  const allKeys = Array.from(game.settings.settings.keys());

  const preferred = [
    "core.rtcWorldSettings",
    "core.rtcClientSettings"
  ].filter(k => allKeys.includes(k));

  const discovered = allKeys.filter(k =>
    k.startsWith("core.") && /(rtc|webrtc|av)/i.test(k)
  );

  return Array.from(new Set([...preferred, ...discovered]));
}

async function tryUpdateAVMode(mode) {
  const candidates = discoverCandidates();

  for (const fullKey of candidates) {
    const [namespace, ...rest] = fullKey.split(".");
    const key = rest.join(".");

    let current;
    try {
      current = game.settings.get(namespace, key);
    } catch {
      continue;
    }

    if (!current || (typeof current !== "object")) continue;
    if (!Object.prototype.hasOwnProperty.call(current, "mode")) continue;

    const oldMode = current.mode;
    const updated = { ...current, mode };

    try {
      await game.settings.set(namespace, key, updated);
      return { namespace, key, fullKey, old: oldMode, new: mode };
    } catch {
      // Usually permission issues (non-GM) or world-scope restrictions.
      continue;
    }
  }

  return null;
}

function findCurrentAVModeSetting() {
  const candidates = discoverCandidates();

  for (const fullKey of candidates) {
    const [namespace, ...rest] = fullKey.split(".");
    const key = rest.join(".");

    let current;
    try {
      current = game.settings.get(namespace, key);
    } catch {
      continue;
    }

    if (!current || (typeof current !== "object")) continue;
    if (!Object.prototype.hasOwnProperty.call(current, "mode")) continue;

    return { namespace, key, fullKey, current };
  }

  return null;
}

function safeRerenderAVUi() {
  // Foundry's UI naming changed across major versions and/or themes.
  // We call whatever exists, best-effort.
  try { ui?.webrtc?.render?.(true); } catch {}
  try { ui?.cameraViews?.render?.(true); } catch {}
  try { ui?.av?.render?.(true); } catch {}
}

export class ConferenceModeConfigApp extends FormApplication {
  static get defaultOptions() {
    return mergeObject(super.defaultOptions, {
      id: `${MODULE_ID}-conference-mode`,
      title: "A/V: Режим конференции",
      template: `modules/${MODULE_ID}/templates/conference-mode.hbs`,
      width: 520,
      height: "auto",
      closeOnSubmit: false,
      resizable: false
    });
  }

  getData(options = {}) {
    const AV_MODES = getAVModesEnum();
    const info = findCurrentAVModeSetting();

    if (!AV_MODES) {
      return {
        ...super.getData(options),
        error: "Не нашёл AV_MODES (AVSettings). Версия Foundry может быть несовместима.",
        hasModes: false
      };
    }

    const currentMode = info?.current?.mode ?? AV_MODES.VIDEO;

    return {
      ...super.getData(options),
      hasModes: true,
      settingKey: info?.fullKey ?? null,
      currentMode,
      currentLabel: labelForMode(currentMode, AV_MODES),
      modes: {
        off: AV_MODES.DISABLED,
        video: AV_MODES.VIDEO,
        av: AV_MODES.AUDIO_VIDEO
      }
    };
  }

  activateListeners(html) {
    super.activateListeners(html);

    html.find("button[data-mode]").on("click", async (event) => {
      event.preventDefault();
      const modeKey = event.currentTarget?.dataset?.mode;

      const AV_MODES = getAVModesEnum();
      if (!AV_MODES) {
        ui.notifications?.error("Не нашёл AV_MODES (AVSettings). Не могу изменить режим.");
        return;
      }

      const mode = {
        off: AV_MODES.DISABLED,
        video: AV_MODES.VIDEO,
        av: AV_MODES.AUDIO_VIDEO
      }[modeKey];

      if (mode === undefined) return;

      const result = await tryUpdateAVMode(mode);
      if (!result) {
        ui.notifications?.warn("Не смог обновить A/V режим: не нашёл подходящий core-setting или нет прав на world-setting.");
        return;
      }

      ui.notifications?.info(`A/V: режим конференции обновлён (${result.fullKey}: ${result.old} → ${result.new})`);

      // Nudge our own client to re-sync embeds if necessary.
      try { game.webrtc?.client?.refreshAll?.(); } catch {}

      // Force UI refresh so camera tiles and A/V UI reflect the new mode.
      safeRerenderAVUi();

      // Re-render this window to show updated label and highlight.
      this.render(false);
    });
  }

  // We don't use form submit for this app.
  async _updateObject(_event, _formData) {}
}
