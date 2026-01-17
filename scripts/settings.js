import { VdoNinjaStreamsConfigApp } from "./streams-config.js";

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
}
