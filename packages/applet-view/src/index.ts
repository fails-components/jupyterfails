import {
  ILabStatus,
  ILayoutRestorer,
  JupyterFrontEnd,
  JupyterFrontEndPlugin
} from '@jupyterlab/application';
import { IDocumentManager } from '@jupyterlab/docmanager';
import { IDocumentWidget } from '@jupyterlab/docregistry';
import { ITranslator } from '@jupyterlab/translation';
import { INotebookTracker } from '@jupyterlab/notebook';
import { AppletViewToolbarExtension } from './avtoolbarextension';
import { activateAppletView } from './appletview';
import { INotebookShell } from '@jupyter-notebook/application';
import { Kernel } from '@jupyterlab/services';
import { PartialJSONObject, Token } from '@lumino/coreutils';
// import { SplitViewNotebookPanel } from './splitviewnotebookpanel';
import { IFailsCallbacks } from './failscallbacks';
import { Panel } from '@lumino/widgets';
import { ISignal, Signal } from '@lumino/signaling';

export * from './failscallbacks';

export const IFailsLauncherInfo = new Token<IFailsLauncherInfo>(
  '@fails-components/jupyter-fails:IFailsLauncherInfo',
  'A service to commincate with FAILS.'
);
export interface IFailsLauncherInit {
  inLecture: boolean;
  selectedAppid: string | undefined;
  reportMetadata?: (metadata: PartialJSONObject) => void;
}

export interface IFailsLauncherInfo extends IFailsLauncherInit {
  inLectureChanged: ISignal<IFailsLauncherInfo, boolean>;
  selectedAppidChanged: ISignal<this, string | undefined>;
}

export interface ILoadJupyterInfo {
  type: 'loadJupyter';
  inLecture: boolean;
  fileName: string;
  fileData: object | undefined; // TODO replace object with meaning full type
  kernelName: 'python' | 'xpython' | undefined;
}

export interface IReplyJupyter {
  requestId: number;
}

export interface ISaveJupyter extends IReplyJupyter {
  type: 'saveJupyter';
  fileName: string;
}

export interface IActivateApp {
  type: 'activateApp';
  inLecture: boolean;
  appid: string;
}

class FailsLauncherInfo implements IFailsLauncherInfo {
  constructor(options?: IFailsLauncherInfo) {
    this._inLecture = options?.inLecture ?? false;
    this._selectedAppid = options?.selectedAppid ?? undefined;
  }

  get inLectureChanged(): ISignal<this, boolean> {
    return this._inLectureChanged;
  }

  get inLecture(): boolean {
    return this._inLecture;
  }

  set inLecture(value: boolean) {
    if (value === this._inLecture) {
      return;
    }
    this._inLecture = value;
    if (value === false && this._selectedAppid) {
      this._selectedAppid = undefined;
      this._selectedAppidChanged.emit(undefined);
    }
    this._inLectureChanged.emit(value);
  }

  get selectedAppid(): string | undefined {
    return this._selectedAppid;
  }

  get selectedAppidChanged(): ISignal<this, string | undefined> {
    return this._selectedAppidChanged;
  }

  set selectedAppid(appid: string | undefined) {
    if (appid === this._selectedAppid) {
      return;
    }
    this._selectedAppid = appid;
    if (!this._inLecture && typeof appid !== 'undefined') {
      this._inLecture = true;
      this._inLectureChanged.emit(true);
    } else if (this._inLecture && typeof appid === 'undefined') {
      this._inLecture = false;
      this._inLectureChanged.emit(false);
    }
    this._selectedAppidChanged.emit(appid);
  }

  private _inLecture: boolean;
  private _inLectureChanged = new Signal<this, boolean>(this);
  private _selectedAppid: string | undefined;
  private _selectedAppidChanged = new Signal<this, string | undefined>(this);
}

function activateFailsLauncher(
  app: JupyterFrontEnd,
  docManager: IDocumentManager,
  status: ILabStatus,
  shell: INotebookShell | null
): IFailsLauncherInfo {
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
  const failsLauncherInfo: IFailsLauncherInfo = new FailsLauncherInfo();
  let currentDocWidget: IDocumentWidget | undefined;

  // Install Messagehandler
  if (!(window as any).failsCallbacks) {
    (window as any).failsCallbacks = {};
  }
  let senderOrigin: string | undefined;
  const _failsCallbacks = (window as any).failsCallbacks as IFailsCallbacks;
  _failsCallbacks.postMessageToFails = (
    message: any,
    transfer?: Transferable[]
  ) => {
    if (typeof senderOrigin !== 'undefined') {
      window.parent.postMessage(message, senderOrigin, transfer);
    }
  };
  status.dirtySignal.connect((sender, dirty) => {
    _failsCallbacks.postMessageToFails!({
      task: 'docDirty',
      dirty
    });
  });
  failsLauncherInfo.reportMetadata = metadata => {
    _failsCallbacks.postMessageToFails!({
      task: 'reportMetadata',
      metadata
    });
  };
  failsLauncherInfo.inLectureChanged.connect(
    (sender: IFailsLauncherInfo, inLecture) => {
      if (shell !== null) {
        shell.menu.setHidden(inLecture);
      }
    }
  );
  window.addEventListener('message', (event: MessageEvent<any>) => {
    // TODO identify the embedding page.
    if (typeof senderOrigin === 'undefined') {
      senderOrigin = event.origin;
    }
    // handle FAILS control messages
    switch (event.data.type) {
      case 'loadJupyter':
        {
          const loadJupyterInfo = event.data as ILoadJupyterInfo;
          failsLauncherInfo.inLecture =
            loadJupyterInfo.inLecture ?? failsLauncherInfo.inLecture;
          docManager.autosave = false; // do not autosave
          // TODO send fileData to contents together with filename, and wait for fullfillment
          // may be use a promise for fullfillment, e.g. pass a resolve
          // afterwards we load the file or new file into to the contexts
          // we may also send license information
          _failsCallbacks.callContents!({
            task: 'loadFile',
            fileData: loadJupyterInfo.fileData,
            fileName: loadJupyterInfo.fileName
          })
            .then(() => {
              // ok the file is placed inside the file system now load it into the app
              const kernel: Partial<Kernel.IModel> = {
                name: loadJupyterInfo.kernelName || 'python' // 'xpython' for xeus
              };
              const defaultFactory = docRegistry.defaultWidgetFactory(
                loadJupyterInfo.fileName
              ).name;
              const factory = defaultFactory;
              currentDocWidget = docManager.open(
                loadJupyterInfo.fileName,
                factory,
                kernel,
                {
                  ref: '_noref'
                }
              );
            })
            .catch(error => {
              console.log('Problem task load file', error);
            });
        }
        break;
      case 'saveJupyter':
        {
          const saveJupyter = event.data as ISaveJupyter;
          if (typeof currentDocWidget === 'undefined') {
            _failsCallbacks.postMessageToFails!({
              requestId: event.data.requestId,
              task: 'saveJupyter',
              error: 'No document loaded'
            });
            break;
          }
          const context = docManager.contextForWidget(currentDocWidget);
          if (typeof context === 'undefined') {
            _failsCallbacks.postMessageToFails!({
              requestId: event.data.requestId,
              task: 'saveJupyter',
              error: 'No document context'
            });
            break;
          }
          context
            .save()
            .then(() => {
              // ok it was save to our virtual disk
              return _failsCallbacks.callContents!({
                task: 'savedFile',
                fileName: saveJupyter.fileName
              });
            })
            .then(({ fileData }) => {
              _failsCallbacks.postMessageToFails!({
                requestId: event.data.requestId,
                task: 'saveJupyter',
                fileData
              });
            })
            .catch((error: Error) => {
              _failsCallbacks.postMessageToFails!({
                requestId: event.data.requestId,
                task: 'saveJupyter',
                error: error.toString()
              });
            });
        }
        break;
      case 'activateApp':
        {
          const activateApp = event.data as IActivateApp;
          if (activateApp.inLecture) {
            failsLauncherInfo.selectedAppid = activateApp.appid;
          } else {
            failsLauncherInfo.inLecture = false;
          }
        }
        break;
      case 'switchApplet': // switches the current visible applet
      case 'requestAvailableApplets': // get all available applets, the response should also be automatically generated by changes
    }
  });

  app.started.then(async () => {
    if (window.parent) {
      window.parent.postMessage(
        {
          task: 'appLoaded'
        },
        '*' // this is relatively safe, as we only say we are ready
      );
    }
    if (shell) {
      // we have a notebook
      shell.collapseTop();
      if (failsLauncherInfo.inLecture) {
        const menuWrapper = shell['_menuWrapper'] as Panel;
        menuWrapper.hide();
        // const main = shell['_main'] as SplitViewNotebookPanel;
        // main.toolbar.hide();
      }
    }
  });
  return failsLauncherInfo;
}

const appletView: JupyterFrontEndPlugin<void> = {
  id: '@fails-components/jupyter-applet-view:plugin',
  description:
    "An extension, that let's you select cell and switch to an applet mode, where only the selected cells are visible. This is used for fails-components to have jupyter applets in interactive teaching. ",
  requires: [IDocumentManager, INotebookTracker, ITranslator],
  optional: [ILayoutRestorer, IFailsLauncherInfo],
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

// TODO move  to separate plugin
const failsLauncher: JupyterFrontEndPlugin<IFailsLauncherInfo> = {
  id: '@fails-components/jupyter-fails:launcher',
  description: 'Configures the notebooks application over messages',
  autoStart: true,
  activate: activateFailsLauncher,
  provides: IFailsLauncherInfo,
  requires: [IDocumentManager, ILabStatus],
  optional: [INotebookShell]
};

/**
 * Initialization data for the @fails-components/jupyter-applet-view extension.
 */
const plugins: JupyterFrontEndPlugin<any>[] = [
  // all JupyterFrontEndPlugins
  appletView,
  appletViewToolbar,
  failsLauncher
];

export default plugins;
