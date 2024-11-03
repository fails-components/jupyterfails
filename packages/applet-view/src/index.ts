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

function activateFailsLauncher(app: JupyterFrontEnd): void {
  if (app.namespace === 'JupyterLite Server') {
    return;
  }
  // parts taken from repl-extension
  const { /* commands, */ serviceManager, started } = app;
  Promise.all([started, serviceManager.ready]).then(async () => {
    /*  commands.execute('notebook:create-new', {
      kernelId: undefined,
      kernelName: undefined
    }); */
    // TODO select kernel and replace with content
  });
}

const appletView: JupyterFrontEndPlugin<void> = {
  id: '@fails-components/jupyter-applet-view:plugin',
  description:
    "An extension, that let's you select cell and switch to an applet mode, where only the selected cells are visible. This is used for fails-components to have jupyter applets in interactive teaching. ",
  requires: [IDocumentManager, INotebookTracker, ITranslator],
  optional: [ILayoutRestorer],
  autoStart: false,
  activate: activateAppletView
};

const appletViewToolbar: JupyterFrontEndPlugin<void> = {
  id: '@fails-components/jupyter-applet-view:toolbar',
  description: 'Add the applet view toolbar during editing.',
  autoStart: false,
  activate: async (app: JupyterFrontEnd) => {
    if (app.namespace === 'JupyterLite Server') {
      return;
    }
    const toolbarItems = undefined;
    console.log('app commands', app.commands);
    app.docRegistry.addWidgetExtension(
      'Notebook',
      new AppletViewToolbarExtension(app.commands, toolbarItems)
    );
  },
  optional: []
};

const failsLauncher: JupyterFrontEndPlugin<void> = {
  id: '@fails-components/jupyter-fails-repl:launcher',
  description: 'Configures the notebooks application over messages',
  autoStart: false,
  activate: activateFailsLauncher,
  requires: [],
  optional: []
};

/**
 * Initialization data for the @fails-components/jupyter-applet-view extension.
 */
const plugins: JupyterFrontEndPlugin<void>[] = [
  // all JupyterFrontEndPlugins
  appletView,
  appletViewToolbar,
  failsLauncher
];

export default plugins;
