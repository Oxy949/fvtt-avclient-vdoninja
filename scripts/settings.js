import { VdoNinjaStreamsConfigApp } from "./streams-config.js";

export const MODULE_ID = "fvtt-avclient-vdoninja";
export const STREAMS_MAPPING_SETTING = "streams";

export function registerVdoNinjaSettings() {
  game.settings.register(MODULE_ID, STREAMS_MAPPING_SETTING, {
    name: "VDO.Ninja streams (per user)",
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
    name: "VDO.Ninja stream URLs",
    label: "Configure VDO.Ninja URLs",
    hint:
      "Paste a VDO.Ninja viewer (\"view\") link for each Foundry user. Foundry camera tiles will show those streams.",
    icon: "fas fa-video",
    type: VdoNinjaStreamsConfigApp,
    restricted: true
  });
}
