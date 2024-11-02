import { PageConfig, URLExt } from '@jupyterlab/coreutils';
import { ISettings, IPlugin as ISettingsPlugin } from '@jupyterlite/settings';
import { PromiseDelegate } from '@lumino/coreutils';
import * as json5 from 'json5';

// portions used from Jupyterlab:
/* -----------------------------------------------------------------------------
| Copyright (c) Jupyter Development Team.
| Distributed under the terms of the Modified BSD License.
|----------------------------------------------------------------------------*/
// This code contains portions from or is inspired by Jupyter lab and lite

export class FailsSettings implements ISettings {
  // the following is copied from the original Jupyter Lite Settings Object
  static _overrides: Record<string, ISettingsPlugin['schema']['default']> =
    JSON.parse(PageConfig.getOption('settingsOverrides') || '{}');

  static override(plugin: ISettingsPlugin): ISettingsPlugin {
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

  constructor() {
    this._ready = new PromiseDelegate();
  }

  get ready(): Promise<void> {
    return this._ready.promise;
  }

  async initialize() {
    this._ready.resolve(void 0);
  }

  // copied from the original settings
  async get(pluginId: string): Promise<ISettingsPlugin | undefined> {
    const all = await this.getAll();
    const settings = all.settings as ISettingsPlugin[];
    const setting = settings.find((setting: ISettingsPlugin) => {
      return setting.id === pluginId;
    });
    return setting;
  }

  // copied from the original settings
  async getAll(): Promise<{ settings: ISettingsPlugin[] }> {
    const allCore = await this._getAll('all.json');
    let allFederated: ISettingsPlugin[] = [];
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
    return { settings };
  }

  // one to one copy from settings of the original JupyterLite
  private async _getAll(
    file: 'all.json' | 'all_federated.json'
  ): Promise<ISettingsPlugin[]> {
    const settingsUrl = PageConfig.getOption('settingsUrl') ?? '/';
    const all = (await (
      await fetch(URLExt.join(settingsUrl, file))
    ).json()) as ISettingsPlugin[];
    return all;
  }

  async save(pluginId: string, raw: string): Promise<void> {
    // we do nothing
  }

  private _ready: PromiseDelegate<void>;
}
