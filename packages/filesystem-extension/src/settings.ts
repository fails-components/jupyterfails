import { PageConfig, URLExt } from '@jupyterlab/coreutils';
import { Setting, SettingManager } from '@jupyterlab/services';
import { ISettingRegistry } from '@jupyterlab/settingregistry';
import * as json5 from 'json5';

// portions used from Jupyterlab:
/* -----------------------------------------------------------------------------
| Copyright (c) Jupyter Development Team.
| Distributed under the terms of the Modified BSD License.
|----------------------------------------------------------------------------*/
// This code contains portions from or is inspired by Jupyter lab and lite
export type SettingsFile = 'all.json' | 'all_federated.json';

export class FailsSettings extends SettingManager implements Setting.IManager {
  // the following is copied from the original Jupyter Lite Settings Object
  static _overrides: Record<
    string,
    ISettingRegistry.IPlugin['schema']['default']
  > = JSON.parse(PageConfig.getOption('settingsOverrides') || '{}');

  static override(plugin: ISettingRegistry.IPlugin): ISettingRegistry.IPlugin {
    if (FailsSettings._overrides[plugin.id]) {
      if (!plugin.schema.properties) {
        // probably malformed, or only provides keyboard shortcuts, etc.
        plugin.schema.properties = {};
      }
      for (const [prop, propDefault] of Object.entries(
        FailsSettings._overrides[plugin.id] || {}
      )) {
        plugin.schema.properties[prop].default = propDefault;
      }
    }
    return plugin;
  }

  constructor(options: SettingManager.IOptions) {
    super({
      serverSettings: options.serverSettings
    });
  }

  // copied from the original settings (updated)
  async fetch(pluginId: string): Promise<ISettingRegistry.IPlugin> {
    const all = await this.list();
    const settings = all.values as ISettingRegistry.IPlugin[];
    const setting = settings.find((setting: ISettingRegistry.IPlugin) => {
      return setting.id === pluginId;
    });
    if (!setting) {
      throw new Error(`Setting ${pluginId} not found`);
    }
    return setting;
  }

  // copied from the original settings (updated)
  async list(
    query?: 'ids'
  ): Promise<{ ids: string[]; values: ISettingRegistry.IPlugin[] }> {
    const allCore = await this._getAll('all.json');
    let allFederated: ISettingRegistry.IPlugin[] = [];
    try {
      allFederated = await this._getAll('all_federated.json');
    } catch {
      // handle the case where there is no federated extension
    }

    // JupyterLab 4 expects all settings to be returned in one go
    // so append the settings from federated plugins to the core ones
    const all = allCore.concat(allFederated);

    // return existing user settings if they exist
    const settings = await Promise.all(
      all.map(async plugin => {
        // const { id } = plugin;
        const raw = /*((await storage.getItem(id)) as string) ?? */ plugin.raw;
        return {
          ...FailsSettings.override(plugin),
          raw,
          settings: json5.parse(raw)
        };
      })
    );

    // format the settings
    const ids =
      settings.map((plugin: ISettingRegistry.IPlugin) => plugin.id) ?? [];

    let values: ISettingRegistry.IPlugin[] = [];
    if (!query) {
      values =
        settings.map((plugin: ISettingRegistry.IPlugin) => {
          plugin.data = { composite: {}, user: {} };
          return plugin;
        }) ?? [];
    }

    return { ids, values };
  }

  // one to one copy from settings of the original JupyterLite
  private async _getAll(
    file: SettingsFile
  ): Promise<ISettingRegistry.IPlugin[]> {
    const settingsUrl = PageConfig.getOption('settingsUrl') ?? '/';
    const all = (await (
      await fetch(URLExt.join(settingsUrl, file))
    ).json()) as ISettingRegistry.IPlugin[];
    return all;
  }

  async save(id: string, raw: string): Promise<void> {
    // we do nothing
  }
}
