import { VdoNinjaStreamsConfigApp } from "./streams-config.js";
import { ConferenceModeConfigApp } from "./conference-config.js";

export const MODULE_ID = "fvtt-avclient-vdoninja";
export const STREAMS_MAPPING_SETTING = "streams";

export function registerVdoNinjaSettings() {
  game.settings.register(MODULE_ID, STREAMS_MAPPING_SETTING, {
    name: game.i18n.localize("VDONINJA.Settings.streams.name"),
    scope: "world",
    config: false,
    type: Object,
    default: {},
    onChange: () => {
      const client = game.webrtc?.client;
      // We need a dock re-render when mapping changes so tiles get added/removed.
      client?.refreshAll?.({ rerenderDock: true });
    }
  });

  game.settings.registerMenu(MODULE_ID, "streamsMenu", {
    name: game.i18n.localize("VDONINJA.Settings.streams.menuName"),
    label: game.i18n.localize("VDONINJA.Settings.streams.menuLabel"),
    hint: game.i18n.localize("VDONINJA.Settings.streams.menuHint"),
    icon: "fas fa-video",
    type: VdoNinjaStreamsConfigApp,
    restricted: true
  });

  game.settings.registerMenu(MODULE_ID, "conferenceModeMenu", {
    name: "A/V: Режим конференции",
    label: "Настроить режим конференции",
    hint: "Переключить встроенный режим A/V конференции Foundry (Выкл / Видео / Видео+Аудио). Меняет core RTC/AV настройки мира.",
    icon: "fas fa-headset",
    type: ConferenceModeConfigApp,
    restricted: true
  });
}
