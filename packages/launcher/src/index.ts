import {
  ILabStatus,
  JupyterFrontEnd,
  JupyterFrontEndPlugin
} from '@jupyterlab/application';
import { IDocumentManager } from '@jupyterlab/docmanager';
import { Kernel } from '@jupyterlab/services';
import { ISessionContext, ILicensesClient } from '@jupyterlab/apputils';
import { IDocumentWidget } from '@jupyterlab/docregistry';
import { INotebookShell } from '@jupyter-notebook/application';
import { NotebookActions, NotebookPanel } from '@jupyterlab/notebook';
import { JSONObject } from '@lumino/coreutils';
import { ISignal, Signal } from '@lumino/signaling';
import { Panel } from '@lumino/widgets';
import { IFailsDriveMessages } from '@fails-components/jupyter-filesystem-extension';
import {
  IFailsLauncherInfo,
  IFailsAppletSize,
  IAppletWidgetRegistry,
  IFailsInterceptorUpdateMessage
} from './tokens';

export * from './tokens';

export interface IScreenShotOpts {
  dpi: number;
}

export interface IAppletScreenshottaker {
  takeAppScreenshot: (opts: IScreenShotOpts) => Promise<Blob | undefined>;
}

export interface IReplyJupyter {
  requestId?: number;
}

export interface IGDPRProxyInfo {
  allowedSites?: string[] | undefined;
  proxySites?: string[] | undefined;
  proxyURL: string;
}

export interface ILoadJupyterInfo {
  type: 'loadJupyter';
  inLecture: boolean;
  rerunAtStartup: boolean;
  installScreenShotPatches: boolean;
  installGDPRProxy?: IGDPRProxyInfo;
  appid?: string;
  fileName: string;
  fileData: object | undefined; // TODO replace object with meaning full type
  kernelName: 'python' | 'xpython' | undefined;
}

export interface ISaveJupyter {
  type: 'saveJupyter';
  fileName: string;
}

export interface IActivateApp {
  type: 'activateApp';
  inLecture: boolean;
  appid?: string;
}

export interface IScreenshotApp extends IScreenShotOpts {
  type: 'screenshotApp';
}

export interface IActivateInterceptor {
  type: 'activateInterceptor';
  activate: boolean;
}

export interface IGetLicenses {
  type: 'getLicenses';
}

export interface IRestartKernelAndRerunCells {
  type: 'restartKernelAndRerunCells';
}

export interface IInterceptorUpdate {
  path: string;
  mime: string;
  state: JSONObject;
}

export interface IReceiveInterceptorUpdate extends IInterceptorUpdate {
  type: 'receiveInterceptorUpdate';
}

export type IFailsToJupyterMessage =
  | IActivateApp
  | IActivateInterceptor
  | IGetLicenses
  | IReceiveInterceptorUpdate
  | IRestartKernelAndRerunCells
  | ILoadJupyterInfo
  | IScreenshotApp
  | ISaveJupyter;

export interface IAppLoaded {
  task: 'appLoaded';
}

export interface IDocDirty {
  task: 'docDirty';
  dirty: boolean;
}

export interface IReportMetadata {
  task: 'reportMetadata';
  metadata: {
    failsApp?: JSONObject;
    kernelspec?: JSONObject;
  };
}

export interface IReportFailsAppletSizes {
  task: 'reportFailsAppletSizes';
  appletSizes: { [key: string]: IFailsAppletSize };
}

export interface IReportKernelStatus {
  task: 'reportKernelStatus';
  status: string;
}

export interface ISendInterceptorUpdate extends IInterceptorUpdate {
  task: 'sendInterceptorUpdate';
}

export type IJupyterToFailsMessage =
  | IReportMetadata
  | IReportFailsAppletSizes
  | ISendInterceptorUpdate
  | IReportKernelStatus
  | IAppLoaded
  | IDocDirty;

let screenShotPatchInstalled = false;
const installScreenShotPatches = () => {
  if (screenShotPatchInstalled) {
    return;
  }

  // Monkey patch the HTMLCanvasObject
  const oldGetContext = HTMLCanvasElement.prototype.getContext;
  // @ts-expect-error type do not matter
  HTMLCanvasElement.prototype.getContext = function (
    contexttype: string,
    contextAttributes?:
      | CanvasRenderingContext2DSettings
      | WebGLContextAttributes
  ) {
    if (contexttype === 'webgl' || contexttype === 'webgl2') {
      const newcontext = { ...contextAttributes } as any;
      newcontext.preserveDrawingBuffer = true;
      return oldGetContext.apply(this, [contexttype, newcontext]);
    }
    return oldGetContext.apply(this, [contexttype, contextAttributes]);
  };
  screenShotPatchInstalled = true;
};

// Monkey patch fetch, e.g. for GDPR compliance
let fetchPatchInstalled = false;
const installFetchPatches = ({
  allowedSites = undefined,
  proxySites = undefined,
  proxyURL
}: IGDPRProxyInfo) => {
  if (fetchPatchInstalled) {
    return;
  }
  const allowedOrigins = [location.origin, ...(allowedSites || [])];
  const allowedOriginsString = allowedOrigins
    .map(el => "'" + new URL(el).origin + "'")
    .join(',');
  const proxySitesString = (proxySites || [])
    .map(el => "'" + new URL(el).origin + "'")
    .join(',');

  // Monkey patch fetch
  const oldFetch = globalThis.fetch;
  globalThis.fetch = async (
    url: RequestInfo | URL,
    options: RequestInit = {}
  ) => {
    const urlObj =
      url instanceof URL
        ? url
        : new URL(url instanceof Request ? url.url : url, location.href);
    if (allowedOrigins.includes(urlObj.origin)) {
      return oldFetch(url instanceof Request ? url : urlObj, options);
    }
    if (proxySites && proxySites.includes(urlObj.origin)) {
      // rewrite the URL and response
      const resURL = proxyURL + urlObj.hostname + urlObj.pathname;
      if (url instanceof Request) {
        const request = url;
        const newRequest = new Request(resURL, {
          method: request.method,
          headers: request.headers,
          body: request.body,
          credentials: request.credentials,
          mode: request.mode,
          integrity: request.integrity,
          keepalive: request.keepalive,
          referrerPolicy: request.referrerPolicy,
          cache: request.cache,
          redirect: request.redirect,
          referrer: request.referrer,
          signal: request.signal
        });
        return oldFetch(newRequest, options);
      } else {
        urlObj.href = resURL;
        return oldFetch(urlObj, options);
      }
    }
    console.log('alien fetch URL:', urlObj.href);
    return new Response('Blocked domain, access forbidden', {
      status: 403,
      statusText: 'Forbidden',
      headers: { 'Content-Type': 'text/plain' }
    });
  };
  const oldImportScripts = globalThis.importScripts;
  globalThis.importScripts = (...args) => {
    const newargs = args.map(url => {
      const urlObj = new URL(url, location.href);
      if (allowedOrigins.includes(urlObj.origin)) {
        return url;
      }
      if (proxySites && proxySites.includes(urlObj.origin)) {
        return proxyURL + urlObj.hostname + urlObj.pathname;
      }
      throw new Error('Script is from blocked URL');
    });
    return oldImportScripts(...newargs);
  };
  const oldWorker = Worker;
  const NewWorker = function (
    script: string | URL,
    options?: WorkerOptions | undefined
  ) {
    const scriptURL =
      script instanceof URL ? script : new URL(script, location.href);
    if (!allowedOrigins.includes(scriptURL.origin)) {
      console.log('Creating worker from blocked origin:', scriptURL.origin);
      return;
    }
    console.log('Tap into creating worker:', scriptURL.href);
    const injectPrefix = `(function() {
      const allowedOrigins = [ ${allowedOriginsString} ];
      const proxySites = [ ${proxySitesString} ];
      const proxyURL = '${proxyURL}';
      const oldFetch = globalThis.fetch;
      globalThis.fetch = async function(url, options = {}) {
        const urlObj = url instanceof URL ? url : new URL(url instanceof Request ? url.url : url, location.href);
        if (allowedOrigins.includes(urlObj.origin)) {
          return oldFetch(url instanceof Request ? url : urlObj, options);
        }
        if (proxySites && proxySites.includes(urlObj.origin)) {
           // rewrite the URL and response
          const resURL = proxyURL + urlObj.hostname + urlObj.pathname;
          console.log('proxy url debug', resURL, urlObj.href);
          if (url instanceof Request) {
            const request = url;
            const newRequest = new Request(resURL, {
              method: request.method,
              headers: request.headers,
              body: request.body,
              credentials: request.credentials,
              mode: request.mode,
              integrity: request.integrity,
              keepalive: request.keepalive,
              referrerPolicy: request.referrerPolicy,
              cache: request.cache,
              redirect: request.redirect,
              referrer: request.referrer,
              signal: request.signal
          });
          console.log('proxy request debug', newRequest, request);
          return oldFetch(newRequest, options);
        } else {
          urlObj.href = resURL;
          return oldFetch(urlObj, options);
        }
      }
      console.log('alien fetch URL worker:', urlObj.href);
      return new Response('Blocked domain, access forbidden',{
        status: 403,
        statusText: 'Forbidden',
        headers: { 'Content-Type': 'text/plain' }
      });
      };
      const oldImportScripts = globalThis.importScripts;
      globalThis.importScripts = (...args) => {
      const newargs = args.map(url => {
        const urlObj = new URL(url, location.href);
        if (allowedOrigins.includes(urlObj.origin)) {
          return url;
        }
        if (proxySites && proxySites.includes(urlObj.origin)) {
          return proxyURL + urlObj.hostname + urlObj.pathname;
        }
          throw new Error('Script is from blocked URL');
        });
        return oldImportScripts(...newargs);
      };
      Object.defineProperty(globalThis, 'location', {
        value: new URL('${scriptURL.href}'),
        writable: false,
        configurable: false,
        enumerable: true,
      });
      })();`;
    const inject =
      injectPrefix +
      (options?.type === 'module'
        ? `
      import('${scriptURL.href}').catch(error => {
        console.error('Can not load module patching Worker:', error);
      });`
        : `
      importScripts('${scriptURL.href}')
      `);
    const blob = new Blob([inject], { type: 'application/javascript' });
    const url = URL.createObjectURL(blob);
    const newWorker = new oldWorker(url, options);
    newWorker.addEventListener(
      'message',
      () => {
        URL.revokeObjectURL(url);
      },
      { once: true }
    );
    return newWorker;
  } as unknown as typeof Worker;

  NewWorker.prototype = oldWorker.prototype;
  NewWorker.prototype.constructor = NewWorker;
  globalThis.Worker = NewWorker;
  fetchPatchInstalled = true;
};

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

  get appletSizes() {
    return this._appletSizesProxy;
  }

  get appletSizesChanged() {
    return this._appletSizesChanged;
  }

  get updateMessageArrived():
    | ISignal<IAppletWidgetRegistry, IFailsInterceptorUpdateMessage>
    | undefined {
    return this._updateMessageArrived;
  }

  set updateMessageArrived(
    updateMessageArrived:
      | ISignal<IAppletWidgetRegistry, IFailsInterceptorUpdateMessage>
      | undefined
  ) {
    this._updateMessageArrived = updateMessageArrived;
  }

  get remoteUpdateMessageArrived(): ISignal<
    IFailsLauncherInfo,
    IFailsInterceptorUpdateMessage
  > {
    return this._remoteUpdateMessageArrived;
  }

  receiveRemoteUpdateMessage(message: IFailsInterceptorUpdateMessage) {
    this._remoteUpdateMessageArrived.emit(message);
  }

  private _inLecture: boolean;
  private _inLectureChanged = new Signal<this, boolean>(this);
  private _selectedAppid: string | undefined;
  private _selectedAppidChanged = new Signal<this, string | undefined>(this);
  private _updateMessageArrived:
    | ISignal<IAppletWidgetRegistry, IFailsInterceptorUpdateMessage>
    | undefined;
  private _remoteUpdateMessageArrived: Signal<
    IFailsLauncherInfo,
    IFailsInterceptorUpdateMessage
  > = new Signal<this, IFailsInterceptorUpdateMessage>(this);
  private _appletSizes: { [key: string]: IFailsAppletSize } = {};
  private _appletSizesChanged = new Signal<
    this,
    { [key: string]: IFailsAppletSize }
  >(this);
  private _appletSizesProxy = new Proxy(this._appletSizes, {
    get: (target, property) => {
      if (typeof property !== 'symbol') {
        return target[property];
      }
    },
    set: (target, property, value) => {
      if (typeof property !== 'symbol') {
        if (target[property] !== value) {
          target[property] = value;
          this._appletSizesChanged.emit(target);
        }
        return true;
      }
      return false;
    }
  });
}

function activateFailsLauncher(
  app: JupyterFrontEnd,
  docManager: IDocumentManager,
  status: ILabStatus,
  licenseClient: ILicensesClient,
  driveMessages: IFailsDriveMessages,
  shell: INotebookShell | null
): IFailsLauncherInfo {
  // parts taken from repl-extension
  const { /* commands, */ serviceManager, started } = app;
  const sendMessageToDrive = driveMessages.sendMessage;
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

  let senderOrigin: string | undefined;
  const postMessageToFails = (message: any, transfer?: Transferable[]) => {
    if (typeof senderOrigin !== 'undefined') {
      window.parent.postMessage(message, senderOrigin, transfer);
    }
  };
  status.dirtySignal.connect((sender, dirty) => {
    postMessageToFails!({
      task: 'docDirty',
      dirty
    });
  });
  failsLauncherInfo.reportMetadata = metadata => {
    postMessageToFails!({
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
  failsLauncherInfo.appletSizesChanged.connect(
    (
      sender: IFailsLauncherInfo,
      appletSizes: { [key: string]: IFailsAppletSize }
    ) => {
      postMessageToFails!({
        task: 'reportFailsAppletSizes',
        appletSizes
      });
    }
  );
  let interceptorActivated = false;
  const sendInterceptorUpdate = (
    sender: IAppletWidgetRegistry,
    message: IFailsInterceptorUpdateMessage
  ): void => {
    postMessageToFails!({
      task: 'sendInterceptorUpdate',
      ...message
    });
  };

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
          if (loadJupyterInfo.installScreenShotPatches) {
            installScreenShotPatches();
          }
          if (loadJupyterInfo.installGDPRProxy) {
            installFetchPatches(loadJupyterInfo.installGDPRProxy);
          }
          // TODO send fileData to contents together with filename, and wait for fullfillment
          // may be use a promise for fullfillment, e.g. pass a resolve
          // afterwards we load the file or new file into to the contexts
          // we may also send license information
          sendMessageToDrive({
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
              if (loadJupyterInfo.appid) {
                failsLauncherInfo.selectedAppid = loadJupyterInfo.appid;
              }
              let rerunAfterKernelStart = loadJupyterInfo.rerunAtStartup;
              if (typeof currentDocWidget !== 'undefined') {
                const notebookPanel = currentDocWidget as NotebookPanel;
                notebookPanel.sessionContext.statusChanged.connect(
                  (context: ISessionContext, status: Kernel.Status) => {
                    postMessageToFails!({
                      task: 'reportKernelStatus',
                      status
                    });
                    if (status === 'idle' && rerunAfterKernelStart) {
                      console.log('Run all cells after startup');
                      const { context, content } = notebookPanel;
                      const cells = content.widgets;
                      NotebookActions.runCells(
                        content,
                        cells,
                        context.sessionContext
                      )
                        .then(() => {
                          console.log('Run all cells after startup finished');
                        })
                        .catch(error => {
                          console.log(
                            'Run all cells after startup error',
                            error
                          );
                        });

                      rerunAfterKernelStart = false;
                    }
                  }
                );
              }
            })
            .catch((error: any) => {
              console.log('Problem task load file', error);
            });
        }
        break;
      case 'saveJupyter':
        {
          const saveJupyter = event.data as ISaveJupyter;
          if (typeof currentDocWidget === 'undefined') {
            postMessageToFails!({
              requestId: event.data.requestId,
              task: 'saveJupyter',
              error: 'No document loaded'
            });
            break;
          }
          const context = docManager.contextForWidget(currentDocWidget);
          if (typeof context === 'undefined') {
            postMessageToFails!({
              requestId: event.data.requestId,
              task: 'saveJupyter',
              error: 'No document context'
            });
            break;
          }
          context
            .save()
            .then(async () => {
              // ok it was save to our virtual disk
              return await sendMessageToDrive({
                task: 'savedFile',
                fileName: saveJupyter.fileName
              });
            })
            .then(({ fileData }) => {
              postMessageToFails!({
                requestId: event.data.requestId,
                task: 'saveJupyter',
                fileData
              });
            })
            .catch((error: Error) => {
              postMessageToFails!({
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
          postMessageToFails!({
            requestId: event.data.requestId,
            task: 'activateApp'
          });
        }
        break;
      case 'screenshotApp':
        {
          const screenshotApp = event.data as IScreenshotApp;
          const notebookPanel = currentDocWidget as NotebookPanel;
          if (
            !(typeof (notebookPanel as any)['takeAppScreenshot'] === 'function')
          ) {
            postMessageToFails!({
              requestId: event.data.requestId,
              task: 'screenshotApp',
              error: 'Take App Screenshot unsupported'
            });
          }
          const screenShotTaker =
            notebookPanel as any as IAppletScreenshottaker;
          screenShotTaker
            .takeAppScreenshot({ dpi: screenshotApp.dpi })
            .then(async screenshot => {
              if (screenshot) {
                const data = await screenshot.arrayBuffer();
                postMessageToFails?.(
                  {
                    requestId: event.data.requestId,
                    task: 'screenshotApp',
                    screenshot: { data, type: screenshot.type }
                  },
                  [data]
                ); // TODO add transferable
              } else {
                postMessageToFails?.({
                  requestId: event.data.requestId,
                  task: 'screenshotApp',
                  error: 'Screenshot failed?'
                });
              }
            })
            .catch((error: Error) => {
              console.log('Screenshot error', error);
              postMessageToFails!({
                requestId: event.data.requestId,
                task: 'screenshotApp',
                error: error.toString()
              });
            });
        }
        break;
      case 'activateInterceptor':
        {
          const activateInterceptor = event.data as IActivateInterceptor;
          if (
            interceptorActivated !== activateInterceptor.activate &&
            failsLauncherInfo.updateMessageArrived
          ) {
            if (!interceptorActivated) {
              failsLauncherInfo.updateMessageArrived.connect(
                sendInterceptorUpdate
              );
              interceptorActivated = true;
            } else {
              failsLauncherInfo.updateMessageArrived.disconnect(
                sendInterceptorUpdate
              );
              interceptorActivated = false;
            }
          }
          postMessageToFails!({
            requestId: event.data.requestId,
            task: 'activateInterceptor'
          });
        }
        break;
      case 'receiveInterceptorUpdate':
        {
          const receiveInterceptorUpdate =
            event.data as IReceiveInterceptorUpdate;
          const { path, mime, state } = receiveInterceptorUpdate;
          const launcherInfo = failsLauncherInfo as FailsLauncherInfo;
          launcherInfo.receiveRemoteUpdateMessage({ path, mime, state });
          postMessageToFails!({
            requestId: event.data.requestId,
            task: 'receiveInterceptorUpdate'
          });
        }
        break;
      case 'restartKernelAndRerunCells':
        {
          if (typeof currentDocWidget === 'undefined') {
            postMessageToFails!({
              requestId: event.data.requestId,
              task: 'restartKernelAndRerunCell',
              error: 'No document loaded'
            });
            break;
          }
          const notebookPanel = currentDocWidget as NotebookPanel;
          const { context, content } = notebookPanel;
          const cells = content.widgets;
          console.log('rerun kernel hook');

          notebookPanel.sessionContext
            .restartKernel()
            .then(async () => {
              await NotebookActions.runCells(
                content,
                cells,
                context.sessionContext
              );
              postMessageToFails!({
                requestId: event.data.requestId,
                task: 'restartKernelAndRerunCell',
                success: true
              });
            })
            .catch((error: Error) => {
              postMessageToFails!({
                requestId: event.data.requestId,
                task: 'restartKernelAndRerunCell',
                error: error.toString()
              });
            });
        }
        break;
      case 'getLicenses':
        {
          // broken
          licenseClient
            .getBundles()
            .then(async licenses => {
              postMessageToFails!({
                requestId: event.data.requestId,
                task: 'getLicenses',
                licenses
              });
            })
            .catch(error => {
              postMessageToFails!({
                requestId: event.data.requestId,
                task: 'getLicenses',
                error: error.toString()
              });
            });
        }
        break;
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

const failsLauncher: JupyterFrontEndPlugin<IFailsLauncherInfo> = {
  id: '@fails-components/jupyter-applet-widget:launcher',
  description: 'Configures the notebooks application over messages',
  autoStart: true,
  activate: activateFailsLauncher,
  provides: IFailsLauncherInfo,
  requires: [
    IDocumentManager,
    ILabStatus,
    ILicensesClient,
    IFailsDriveMessages
  ],
  optional: [INotebookShell]
};

/**
 * Initialization data for the @fails-components/jupyter-launcher extension.
 */
const plugins: JupyterFrontEndPlugin<any>[] = [
  // all JupyterFrontEndPlugins
  failsLauncher
];

export default plugins;
