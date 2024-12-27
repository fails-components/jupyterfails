import {
  ILayoutRestorer,
  JupyterFrontEnd,
  JupyterFrontEndPlugin
} from '@jupyterlab/application';
import { IDocumentManager } from '@jupyterlab/docmanager';
import { ITranslator } from '@jupyterlab/translation';
import { INotebookTracker } from '@jupyterlab/notebook';
import { AppletViewToolbarExtension } from './avtoolbarextension';
import { activateAppletView } from './appletview';
import { IFailsInterceptor } from '@fails-components/jupyter-interceptor';
import { IFailsLauncherInfo } from '@fails-components/jupyter-launcher';

const appletView: JupyterFrontEndPlugin<void> = {
  id: '@fails-components/jupyter-applet-view:plugin',
  description:
    "An extension, that let's you select cell and switch to an applet mode, where only the selected cells are visible. This is used for fails-components to have jupyter applets in interactive teaching. ",
  requires: [IDocumentManager, INotebookTracker, ITranslator],
  optional: [ILayoutRestorer, IFailsLauncherInfo, IFailsInterceptor],
  autoStart: true,
  activate: activateAppletView
};

const appletViewToolbar: JupyterFrontEndPlugin<void> = {
  id: '@fails-components/jupyter-applet-view:toolbar',
  description: 'Add the applet view toolbar during editing.',
  autoStart: true,
  activate: async (app: JupyterFrontEnd, launcherInfo: IFailsLauncherInfo) => {
    const toolbarItems = undefined;
    console.log('app commands', app.commands);
    app.docRegistry.addWidgetExtension(
      'Notebook',
      new AppletViewToolbarExtension(app.commands, launcherInfo, toolbarItems)
    );
  },
  optional: [IFailsLauncherInfo]
};

/**
 * Initialization data for the @fails-components/jupyter-applet-view extension.
 */
const plugins: JupyterFrontEndPlugin<any>[] = [
  // all JupyterFrontEndPlugins
  appletView,
  appletViewToolbar
];

export default plugins;
