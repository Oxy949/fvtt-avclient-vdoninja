import { VdoNinjaStreamsConfigApp } from "./streams-config.js";

export const MODULE_ID = "fvtt-avclient-vdoninja";

export function registerVdoNinjaSettings() {
  game.settings.register(MODULE_ID, "streams", {
    name: "VDO.Ninja streams (per user)",
    scope: "world",
    config: false,
    type: Object,
    default: {},
    onChange: () => {
      const client = game.webrtc?.client;

      // Обновляем существующие iframe
      client?.refreshAll?.();

      // Пересобираем тайлы (добавить/убрать камеры)
      try {
        ui?.webrtc?.render?.(true);
      } catch (_err) { /* no-op */ }
    }
  });

  game.settings.registerMenu(MODULE_ID, "streamsMenu", {
    name: "VDO.Ninja stream URLs",
    label: "Configure VDO.Ninja URLs",
    hint: "Paste a VDO.Ninja viewer (\"view\") link for each Foundry user. Foundry camera tiles will show those streams.",
    icon: "fas fa-video",
    type: VdoNinjaStreamsConfigApp,
    restricted: true
  });
}
