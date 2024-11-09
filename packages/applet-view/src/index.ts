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
import { INotebookShell } from '@jupyter-notebook/application';

function activateFailsLauncher(
  app: JupyterFrontEnd,
  docManager: IDocumentManager,
  shell: INotebookShell | null
): void {
  // parts taken from repl-extension
  const { /* commands, */ serviceManager, started } = app;
  Promise.all([started, serviceManager.ready]).then(async () => {
    /*  commands.execute('notebook:create-new', {
      kernelId: undefined,
      kernelName: undefined
    }); */
    // TODO select kernel and replace with content
  });
  // TODO steer with messages
  const { docRegistry } = app;
  const file = 'proxy.ipynb';

  app.started.then(async () => {
    if (shell) {
      // we have a notebook
      shell.collapseTop();
    }

    const defaultFactory = docRegistry.defaultWidgetFactory(file).name;
    const factory = defaultFactory;
    docManager.open(file, factory, undefined, {
      ref: '_noref'
    });
  });
}

const appletView: JupyterFrontEndPlugin<void> = {
  id: '@fails-components/jupyter-applet-view:plugin',
  description:
    "An extension, that let's you select cell and switch to an applet mode, where only the selected cells are visible. This is used for fails-components to have jupyter applets in interactive teaching. ",
  requires: [IDocumentManager, INotebookTracker, ITranslator],
  optional: [ILayoutRestorer],
  autoStart: true,
  activate: activateAppletView
};

const appletViewToolbar: JupyterFrontEndPlugin<void> = {
  id: '@fails-components/jupyter-applet-view:toolbar',
  description: 'Add the applet view toolbar during editing.',
  autoStart: true,
  activate: async (app: JupyterFrontEnd) => {
    const toolbarItems = undefined;
    console.log('app commands', app.commands);
    app.docRegistry.addWidgetExtension(
      'Notebook',
      new AppletViewToolbarExtension(app.commands, toolbarItems)
    );
  },
  optional: []
};

// TODO move  to separate plugin
const failsLauncher: JupyterFrontEndPlugin<void> = {
  id: '@fails-components/jupyter-fails:launcher',
  description: 'Configures the notebooks application over messages',
  autoStart: true,
  activate: activateFailsLauncher,
  requires: [IDocumentManager],
  optional: [INotebookShell]
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
