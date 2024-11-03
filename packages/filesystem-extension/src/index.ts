import { IContents } from '@jupyterlite/contents';
import {
  JupyterLiteServerPlugin,
  JupyterLiteServer
} from '@jupyterlite/server';
import { ISettings } from '@jupyterlite/settings';
import { FailsContents } from './contents';
import { FailsSettings } from './settings';

export const failsContentsPlugin: JupyterLiteServerPlugin<IContents> = {
  id: '@fails-components/jupyter-fails-server:contents',
  requires: [],
  autoStart: true,
  provides: IContents,
  activate: (app: JupyterLiteServer) => {
    if (app.namespace !== 'JupyterLite Server') {
      console.log('Not on server');
    }
    console.log('FAILS IContents');
    const contents = new FailsContents();
    app.started.then(() => contents.initialize().catch(console.warn));
    return contents;
  }
};

const failsSettingsPlugin: JupyterLiteServerPlugin<ISettings> = {
  id: '@fails-components/jupyter-fails-server:settings',
  requires: [],
  autoStart: true,
  provides: ISettings,
  activate: (app: JupyterLiteServer) => {
    if (app.namespace !== 'JupyterLite Server') {
      console.log('Not on server');
    }
    console.log('FAILS ISettings');
    const settings = new FailsSettings();
    app.started.then(() => settings.initialize().catch(console.warn));
    return settings;
  }
};

const plugins: JupyterLiteServerPlugin<any>[] = [
  failsContentsPlugin,
  failsSettingsPlugin
];

export default plugins;
