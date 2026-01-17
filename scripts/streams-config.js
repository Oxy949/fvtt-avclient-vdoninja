import { MODULE_ID, STREAMS_MAPPING_SETTING } from "./settings.js";

export class VdoNinjaStreamsConfigApp extends FormApplication {
  static get defaultOptions() {
    return mergeObject(super.defaultOptions, {
      id: `${MODULE_ID}-streams-config`,
      title: game.i18n.localize("VDONINJA.StreamsConfig.title"),
      template: `modules/${MODULE_ID}/templates/streams-config.hbs`,
      width: 720,
      height: "auto",
      closeOnSubmit: true,
      resizable: true
    });
  }

  getData(options = {}) {
    const mapping = game.settings.get(MODULE_ID, STREAMS_MAPPING_SETTING) || {};
    const users = game.users.contents.map((u) => {
      return {
        id: u.id,
        name: u.name,
        role: u.role,
        url: mapping[u.id] || ""
      };
    });

    return {
      users
    };
  }

  async _updateObject(event, formData) {
    const next = {};
    for (const u of game.users.contents) {
      const raw = (formData[u.id] ?? "").toString().trim();
      if (!raw) continue;
      next[u.id] = raw;
    }

    await game.settings.set(MODULE_ID, STREAMS_MAPPING_SETTING, next);
    ui.notifications?.info(game.i18n.localize("VDONINJA.StreamsConfig.saved"));
  }

  /**
   * Trim out empty notes blocks so they don't create huge blank gaps in the UI.
   * Some Foundry themes / layouts inject or style .notes in a way that preserves height
   * even when the element has no visible content.
   */
  activateListeners(html) {
    super.activateListeners(html);

    // Remove any notes paragraphs that are effectively empty (incl. whitespace).
    html.find("p.notes").each((_i, el) => {
      try {
        if (!el?.textContent?.trim()) el.remove();
      } catch (_err) {
        // Ignore; best-effort cleanup only.
      }
    });
  }
}
