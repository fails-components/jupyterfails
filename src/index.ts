import {
  ILayoutRestorer,
  JupyterFrontEnd,
  JupyterFrontEndPlugin
} from '@jupyterlab/application';
import { IDocumentManager } from '@jupyterlab/docmanager';
import { DocumentRegistry, DocumentWidget } from '@jupyterlab/docregistry';
import { ITranslator, nullTranslator } from '@jupyterlab/translation';
import {
  INotebookTracker,
  NotebookTracker,
  NotebookPanel,
  NotebookWidgetFactory,
  INotebookModel,
  StaticNotebook,
  Notebook,
  CellList
} from '@jupyterlab/notebook';
import { IWidgetManager, WidgetModel } from '@jupyter-widgets/base';
import {
  IExecuteResult,
  IDisplayData,
  IDisplayUpdate,
  IBaseCellMetadata,
  ICell,
  IOutput
} from '@jupyterlab/nbformat';
import {
  IRenderMime,
  IRenderMimeRegistry,
  RenderMimeRegistry,
  IOutputModel
} from '@jupyterlab/rendermime';
import {
  OutputArea,
  IOutputAreaModel,
  OutputAreaModel
  //  SimplifiedOutputArea
} from '@jupyterlab/outputarea';
import { NotebookHistory } from '@jupyterlab/notebook/lib/history';
import { Cell, CodeCell, ICellModel } from '@jupyterlab/cells';
import { CodeEditor } from '@jupyterlab/codeeditor';
import { IObservableMap } from '@jupyterlab/observables';
import {
  createDefaultFactory,
  MainAreaWidget,
  /* createToolbarFactory, */
  setToolbar,
  ToolbarRegistry
} from '@jupyterlab/apputils';
import {
  Panel,
  SplitPanel,
  BoxLayout,
  Widget,
  PanelLayout,
  AccordionPanel
} from '@lumino/widgets';
import {
  ISharedCodeCell,
  ISharedText,
  ISharedRawCell,
  ISharedMarkdownCell,
  ISharedUnrecognizedCell,
  IMapChange
} from '@jupyter/ydoc';
import {
  UUID,
  ReadonlyPartialJSONObject,
  JSONObject,
  PromiseDelegate
} from '@lumino/coreutils';
import { ArrayExt } from '@lumino/algorithm';
import { CommandRegistry } from '@lumino/commands';
import { IDisposable } from '@lumino/disposable';
import { Signal, ISignal } from '@lumino/signaling';
import { IObservableList, ObservableList } from '@jupyterlab/observables';
import {
  notebookIcon,
  addIcon,
  deleteIcon,
  moveUpIcon,
  moveDownIcon,
  caretUpIcon,
  caretDownIcon,
  Toolbar
} from '@jupyterlab/ui-components';
import { IChangedArgs, PageConfig, URLExt } from '@jupyterlab/coreutils';
import { RestorablePool } from '@jupyterlab/statedb';
import {
  LabWidgetManager,
  WidgetRenderer
} from '@jupyter-widgets/jupyterlab-manager';
import { Kernel, Contents as ServerContents } from '@jupyterlab/services';
import {
  JupyterLiteServer,
  JupyterLiteServerPlugin
} from '@jupyterlite/server';
import { ISettings, IPlugin as ISettingsPlugin } from '@jupyterlite/settings';
import { IContents } from '@jupyterlite/contents';
import * as json5 from 'json5';

export class AppletWidgetRegistry {
  registerModel(path: string, modelId: string) {
    this._modelIdToPath[modelId] = path;
    this._pathToModelId[path] = modelId;
  }

  unregisterPath(path: string) {
    const modelId = this._pathToModelId[path];
    if (modelId) {
      delete this._modelIdToPath[modelId];
    }
    delete this._pathToModelId[path];
  }

  unregisterModel(modelId: string) {
    const path = this._modelIdToPath[modelId];
    delete this._modelIdToPath[modelId];
    if (path) {
      delete this._pathToModelId[path];
    }
  }

  getModel(path: string) {
    return this._pathToModelId[path];
  }

  getPath(modelId: string) {
    return this._modelIdToPath[modelId];
  }

  dispatchMessage(path: string, mime: string, message: any) {
    console.log(path, mime, message);
  }

  private _modelIdToPath: { [key: string]: string } = {};
  private _pathToModelId: { [key: string]: string } = {};
}

// portions used from Jupyterlab:
/* -----------------------------------------------------------------------------
| Copyright (c) Jupyter Development Team.
| Distributed under the terms of the Modified BSD License.
|----------------------------------------------------------------------------*/

// This code contains portions from or is inspired by Jupyter lab's notebook extension, especially the createOutputView part
// Also a lot is taken from the cell toolbar related parts.
function activateAppletView(
  app: JupyterFrontEnd,
  docManager: IDocumentManager,
  notebookTracker: INotebookTracker,
  translator: ITranslator,
  restorer: ILayoutRestorer | null
): void {
  console.log('ACTIVATE applet view');
  if (app.namespace === 'JupyterLite Server') {
    return;
  }
  console.log(
    'JupyterLab extension @fails-components/jupyter-applet-view is activated!'
  );
  const trans = translator.load('fails_components_jupyter_applet_view');
  const addToViewID = 'fails-components-jupyter-applet-view:add_to_view';
  const moveViewUpID = 'fails-components-jupyter-applet-view:move_view_up';
  const moveViewDownID = 'fails-components-jupyter-applet-view:move_view_down';
  const moveViewAppUpID =
    'fails-components-jupyter-applet-view:move_view_app_up';
  const moveViewAppDownID =
    'fails-components-jupyter-applet-view:move_view_app_down';
  const deleteViewID = 'fails-components-jupyter-applet-view:delete_view';
  /*const appletViewOutputs = new WidgetTracker<
    MainAreaWidget<Private.AppletViewOutputArea>
  >({
    namespace: 'cloned-outputs'
  });

  if (restorer) {
    void restorer.restore(appletViewOutputs, {
      command: commandID,
      args: widget => ({
        path: widget.content.path,
        indices: widget.content.indices
      }),
      name: widget =>
        `${widget.content.path}:${widget.content.indices.join(':')}`,
      when: notebookTracker.restored // After the notebook widgets (but not contents).
    });
  } */

  const { commands, shell /* , serviceManager: services */ } = app;

  const realFactory: NotebookWidgetFactory | undefined =
    app.docRegistry.getWidgetFactory(
      'Notebook'
    ) as unknown as NotebookWidgetFactory;
  const factoryName = 'Notebook'; //'SplitViewNotebook';
  if (realFactory !== undefined) {
    const factory = new Private.SplitViewNotebookWidgetFactory({
      name: factoryName,
      label: trans.__('Notebook'),
      fileTypes: ['notebook'],
      modelName: 'notebook',
      defaultFor: ['notebook'],
      preferKernel: realFactory.preferKernel,
      canStartKernel: true,
      rendermime: realFactory.rendermime,
      contentFactory: realFactory.contentFactory,
      editorConfig: realFactory.editorConfig,
      notebookConfig: realFactory.notebookConfig,
      mimeTypeService: realFactory.mimeTypeService,
      toolbarFactory: realFactory['_toolbarFactory'],
      translator
    });
    let id = 0;
    // we need to clone the registration with the tracker from the plugin:
    factory.widgetCreated.connect((sender, widget) => {
      // If the notebook panel does not have an ID, assign it one.
      widget.id = widget.id || `splitviewnotebook-${++id}`;
      const ft = app.docRegistry.getFileType('notebook');
      // Set up the title icon
      widget.title.icon = ft?.icon;
      widget.title.iconClass = ft?.iconClass ?? '';
      widget.title.iconLabel = ft?.iconLabel ?? '';

      // Notify the widget tracker if restore data needs to update.
      const tracker = notebookTracker as NotebookTracker; // dirty hack, does only work as long we do not add anything to the model
      /* widget.context.pathChanged.connect(() => {
        void tracker.save(widget);
      });  // may be we need this */
      // Add the notebook panel to the tracker.
      // void tracker.add(widget);
      widget.context.fileChanged.connect(() => {
        const model = widget.context.model;
        const failsData = model.getMetadata('failsApp');
        const currentSplitView = widget as Private.SplitViewNotebookPanel;
        if (currentSplitView.appletViewWidget) {
          if (failsData) {
            const outputarea = currentSplitView.appletViewWidget;
            if (outputarea !== undefined) {
              outputarea.loadData(failsData);
            }
          }
        }
      });
      widget.context.saveState.connect((slot, savestate) => {
        if (savestate === 'started') {
          console.log('Save data');
          const currentSplitView = widget as Private.SplitViewNotebookPanel;
          const outputarea = currentSplitView.appletViewWidget;
          if (outputarea !== undefined) {
            const failsData = outputarea.saveData();
            console.log('Save data2', failsData);
            if (failsData) {
              console.log('context', widget.context);
              const model = widget.context.model;
              model.setMetadata('failsApp', failsData);
              console.log('Save data3', model);
            }
          }
        }
      });

      // notebookTracker.inject(widget);
      tracker.add(widget);
      if (!notebookTracker.currentWidget) {
        const pool = tracker['_pool'] as RestorablePool;
        pool.current = widget;
      }
    });
    // Handle state restoration.
    // No the notebook should do this.
    /* if (restorer) {
      const tracker = notebookTracker as NotebookTracker;
      void restorer.restore(tracker, {
        command: 'docmanager:open',
        args: panel => ({ path: panel.context.path, factory: factoryName }),
        name: panel => panel.context.path,
        when: services.ready
      });
    } */

    // remove from registry, this is bad monkey patching
    if (app.docRegistry['_widgetFactories']['notebook']) {
      delete app.docRegistry['_widgetFactories']['notebook'];
    }

    app.docRegistry.addWidgetFactory(factory);
    app.docRegistry.setDefaultWidgetFactory(
      'notebook',
      /* 'SplitViewNotebook'*/ 'Notebook'
    );
    // we have to register extensions previously added to the system, FIXME: maybe changed after decoupling from jupyter lab

    /* const itExtension = app.docRegistry.widgetExtensions('Notebook');
    for (const extension of itExtension) {
      app.docRegistry.addWidgetExtension(factoryName, extension);
    }*/
  }

  const canBeActivated = (): boolean => {
    if (
      notebookTracker.currentWidget === null ||
      notebookTracker.currentWidget !== shell.currentWidget
    ) {
      return false;
    }
    const { content } = notebookTracker.currentWidget!;
    const index = content.activeCellIndex;
    // If there are selections that are not the active cell,
    // this command is confusing, so disable it.
    for (let i = 0; i < content.widgets.length; ++i) {
      if (content.isSelected(content.widgets[i]) && i !== index) {
        return false;
      }
    }
    // If the cell is already added we deactivate as well
    const currentSplitView =
      notebookTracker.currentWidget as Private.SplitViewNotebookPanel;
    if (currentSplitView.appletViewWidget) {
      const outputarea = currentSplitView.appletViewWidget;
      if (outputarea !== undefined && outputarea.firstHasIndex(index)) {
        return false;
      }
    }
    return true;
  };

  commands.addCommand(addToViewID, {
    label: /* trans.__(*/ 'Add Output to first Applet view' /*)*/,
    execute: async args => {
      const path = args.path as string | undefined | null;
      let index = args.index as number | undefined | null;
      let current: NotebookPanel | undefined | null;
      let cell: Cell | undefined;

      console.log('Add Output for path and index', path, index, args);
      if (path && index !== undefined && index !== null) {
        current = docManager.findWidget(
          path,
          'Notebook' /* may be needs adjustment later*/
        ) as unknown as NotebookPanel;
        if (!current) {
          return;
        }
      } else {
        current = notebookTracker.currentWidget;
        if (!current) {
          return;
        }
        cell = current.content.activeCell as Cell;
        index = current.content.activeCellIndex;
      }
      // const pathid = current.context.path;
      console.log('debug current cell index', current, cell, index);
      // TODO: Find area if it already exists, and add content
      const currentSplitView = current as Private.SplitViewNotebookPanel;
      if (currentSplitView.appletViewWidget) {
        const outputarea = currentSplitView.appletViewWidget;
        if (outputarea !== undefined && !outputarea.firstHasIndex(index)) {
          outputarea.addPart(undefined, { cell, index });
        }
      }
    },
    icon: args => (args.toolbar ? addIcon : undefined),
    isEnabled: canBeActivated,
    isVisible: canBeActivated
  });

  function getCurrentNotebook(
    args: ReadonlyPartialJSONObject
  ): NotebookPanel | undefined | null {
    let current: NotebookPanel | undefined | null;
    if (typeof args['notebookpath'] !== 'string') {
      current = notebookTracker.currentWidget;
      if (!current) {
        return;
      }
    } else {
      const path: string = args['notebookpath'];
      current = docManager.findWidget(
        path,
        'Notebook' /* may be needs adjustment later*/
      ) as unknown as NotebookPanel;
      if (!current) {
        return;
      }
    }
    return current;
  }

  function moveWidgets(args: ReadonlyPartialJSONObject, delta: number) {
    const current = getCurrentNotebook(args);
    if (!current) {
      return;
    }
    const currentSplitView = current as Private.SplitViewNotebookPanel;
    if (currentSplitView.appletViewWidget) {
      const outputarea = currentSplitView.appletViewWidget;
      const cellid = args.cellid as string;
      const widgetid = args.widgetid as string;
      const appid = outputarea.getWidgetAppId(widgetid);
      if (typeof appid !== 'undefined') {
        outputarea.movePart(appid, cellid, delta);
      }
    }
  }

  function moveWidgetsApp(args: ReadonlyPartialJSONObject, delta: number) {
    const current = getCurrentNotebook(args);
    if (!current) {
      return;
    }
    const currentSplitView = current as Private.SplitViewNotebookPanel;
    if (currentSplitView.appletViewWidget) {
      const outputarea = currentSplitView.appletViewWidget;
      const cellid = args.cellid as string;
      const widgetid = args.widgetid as string;
      const appid = outputarea.getWidgetAppId(widgetid);
      if (typeof appid !== 'undefined') {
        outputarea.moveApp(appid, cellid, delta);
      }
    }
  }

  /*
  function canMoveWidgetsApp(
    args: ReadonlyPartialJSONObject,
    delta: number
  ): boolean {
    const current = getCurrentNotebook(args);
    if (!current) {
      return false;
    }
    const currentSplitView = current as Private.SplitViewNotebookPanel;
    if (currentSplitView.appletViewWidget) {
      const outputarea = currentSplitView.appletViewWidget;
      const cellid = args.cellid as string;
      const widgetid = args.widgetid as string;
      const appid = outputarea.getWidgetAppId(widgetid);
      if (typeof appid !== 'undefined') {
        return outputarea.canMoveApp(appid, cellid, delta);
      }
    }
    return false;
  }
    */

  commands.addCommand(moveViewUpID, {
    label: /* trans.__(*/ 'Move view up' /*)*/,
    execute: async args => {
      console.log('move view up!', args);
      moveWidgets(args, -1);
    },
    icon: args => (args.toolbar ? moveUpIcon : undefined),
    isEnabled: () => true,
    isVisible: () => true
  });
  commands.addCommand(moveViewDownID, {
    label: /* trans.__(*/ 'Move view down' /*)*/,
    execute: async args => {
      console.log('move view down!', args);
      moveWidgets(args, 1);
    },
    icon: args => (args.toolbar ? moveDownIcon : undefined),
    isEnabled: () => true,
    isVisible: () => true
  });
  commands.addCommand(moveViewAppUpID, {
    label: /* trans.__(*/ 'Move view up to other app' /*)*/,
    execute: async args => {
      console.log('move view app up!', args);
      moveWidgetsApp(args, -1);
    },
    icon: args => (args.toolbar ? caretUpIcon : undefined),
    isEnabled: () => true,
    /* isEnabled: args => {
      return canMoveWidgetsApp(args, -1);
    },*/
    isVisible: () => true
  });
  commands.addCommand(moveViewAppDownID, {
    label: /* trans.__(*/ 'Move view down to other app' /*)*/,
    execute: async args => {
      console.log('move view app down!', args);
      moveWidgetsApp(args, 1);
    },
    icon: args => (args.toolbar ? caretDownIcon : undefined),
    isEnabled: () => true,
    /*isEnabled: args => {
      return canMoveWidgetsApp(args, 1);
    },*/
    isVisible: () => true
  });

  commands.addCommand(deleteViewID, {
    label: /* trans.__(*/ 'Delete view' /*)*/,
    execute: async args => {
      console.log('delete view!', args);
      const current = getCurrentNotebook(args);
      if (!current) {
        return;
      }
      const currentSplitView = current as Private.SplitViewNotebookPanel;
      if (currentSplitView.appletViewWidget) {
        const outputarea = currentSplitView.appletViewWidget;
        const cellid = args.cellid as string;
        const widgetid = args.widgetid as string;
        const appid = outputarea.getWidgetAppId(widgetid);
        if (typeof appid !== 'undefined') {
          outputarea.deletePart(appid, cellid);
        }
      }
    },
    icon: args => (args.toolbar ? deleteIcon : undefined),
    isEnabled: () => true,
    isVisible: () => true
  });
}

function activateWidgetInterceptor(
  app: JupyterFrontEnd,
  notebookTracker: INotebookTracker,
  rendermimeRegistry: IRenderMimeRegistry
): void {
  if (app.namespace === 'JupyterLite Server') {
    return;
  }
  const addKernelInterceptor = (kernel: Kernel.IKernelConnection) => {
    console.log('Install Kernel interceptor', kernel);
    kernel.anyMessage.connect((sender, args) => {
      console.log('Intercept any message', sender, args);
      const { direction, msg } = args;
      if (direction === 'send') {
        // send from the control
        const { content, channel } = msg;
        if (channel === 'shell') {
          const { data, comm_id: commId } = content as {
            comm_id: string;
            data: JSONObject;
          };

          if (data?.method === 'update') {
            // got an update
            const path = wRegistry.getPath(commId);
            console.log('Send an update', data.state, commId, path);
            // value, index, button click seems to have an empty message only with outputs
            const {
              value = undefined,
              index = undefined,
              event = undefined
            } = data.state as { value?: any; index?: any; event?: any };
            if (path) {
              const inform = { path, commId, value, index, event };
              wRegistry.dispatchMessage(path, widgetsMime, inform);
              // console.log('Inform message', inform, path);
              // TODO store and send message!
            }
          }
        }
        // now fish all messages of control out
      }
    });
  };

  const wRegistry = new AppletWidgetRegistry();
  const widgetsMime = 'application/vnd.jupyter.widget-view+json';

  // add interceptors for mimerenderers, whose javascript, we need to patch
  if (rendermimeRegistry) {
    const rmRegistry = rendermimeRegistry as RenderMimeRegistry;
    const mimetypes = ['application/vnd.plotly.v1+json']; // mimetypes to patch

    mimetypes.forEach(mime => {
      const factory = rmRegistry.getFactory(
        mime
      ) as IRenderMime.IRendererFactory;
      if (!factory) {
        console.log(
          'Plotly seems to be not installed! So I can not add an interceptor'
        );
        return;
      }
      // ok, lets add an interceptor
      const createRendererOld = factory.createRenderer;
      factory.createRenderer = function (
        options: IRenderMime.IRendererOptions
      ) {
        const renderer = createRendererOld(options);
        console.log('intercepted renderer', mime, renderer, renderer.node);
        // we have also the replace renderModel
        const renderModelOld = renderer.renderModel.bind(renderer);
        renderer.renderModel = async (model: IRenderMime.IMimeModel) => {
          let result = await renderModelOld(model);
          console.log('intercepted renderer model', model);
          if (!(<any>renderer).hasGraphElement()) {
            result = await (renderer as any).createGraph(
              (renderer as any)?._model
            );
          }
          if ((<any>renderer.node).on) {
            const messages = [
              'relayout',
              'hover',
              'unhover',
              'selected',
              'selecting',
              'restyle'
            ];
            messages.forEach(mess => {
              (<any>renderer.node).on('plotly_' + mess, (data: any) => {
                const path = model.metadata?.appPath as string;
                if (path) {
                  wRegistry.dispatchMessage(path, mime, {
                    message: mess,
                    data
                  });
                }
                //console.log('plotly', mess, data, model.metadata?.appPath);
              });
            });
          }
          console.log(
            'renderer layout rM',
            // @ts-expect-error plotly
            renderer.node.layout,
            // @ts-expect-error plotly
            !!renderer.node.on,
            renderer
          );
          //@ts-expect-error result is different from void
          console.log('renderer result', result, !!result?.on);

          return result;
        };
        // special code for plotly
        // @ts-expect-error plotly
        console.log('renderer layout', renderer.node.layout);
        /* if (!(renderer as any).hasGraphElement()) {
          (renderer as any).createGraph((renderer as any)['_model]']);
        } */

        /* //@ts-expect-error on not found
        renderer.node.on('plotly_relayout', (update: any) => {
          console.log('relayout', update);
        }); */

        // special code for plotly
        return renderer;
      };
    });
  }

  notebookTracker.widgetAdded.connect(
    (sender: INotebookTracker, panel: NotebookPanel) => {
      if (panel.sessionContext.session?.kernel) {
        addKernelInterceptor(panel.sessionContext.session.kernel);
      }
      panel.sessionContext.kernelChanged.connect((sender, args) => {
        if (args.newValue) {
          addKernelInterceptor(args.newValue);
          // TODO remove old interceptor?
        }
      });

      const widgetManagerPromise: Promise<IWidgetManager> =
        panel.context.sessionContext.ready.then(() => {
          return new Promise((resolve, reject) => {
            requestAnimationFrame(async () => {
              // ensure it is handled after the widgetmanager is installed.
              const rendermime = panel.content.rendermime;
              const widgetFactory = rendermime.getFactory(widgetsMime);
              console.log('before my dummy', widgetFactory, rendermime);
              if (widgetFactory) {
                // now create a dummy widget
                const dummyWidget = widgetFactory.createRenderer({
                  mimeType: widgetsMime,
                  sanitizer: {
                    sanitize: (dirty, options) => ''
                  },
                  resolver: {
                    getDownloadUrl: url => Promise.resolve(''),
                    resolveUrl: url => Promise.resolve('')
                  },
                  latexTypesetter: null,
                  linkHandler: null
                });
                console.log(
                  'widgetmanager',
                  (dummyWidget as unknown as { _manager: IWidgetManager })
                    ._manager,
                  dummyWidget
                );
                resolve(
                  await (
                    dummyWidget as unknown as {
                      _manager: PromiseDelegate<IWidgetManager>;
                    }
                  )._manager.promise
                );
                dummyWidget.dispose();
              } else {
                reject(new Error('No widgetFactory found for widget view'));
              }
            });
          });
        });

      widgetManagerPromise?.then(widgetManager => {
        const notebookModel = panel.model as INotebookModel;
        if (notebookModel) {
          const trackedCells = new WeakSet<ICellModel>();

          const pendingModels: { path: string; widget_model_id: string }[] = [];

          const iterateWidgets = async (
            path: string,
            widget_model_id: string
          ) => {
            if (widgetManager?.has_model(widget_model_id)) {
              const widget = await widgetManager?.get_model(widget_model_id);
              // const children = widget.attributes.children as
              /* widget.attributes.children.forEach((child) => {
                iterateWidgets(path + '/' + child. ,)
              }) */
              const mypath = path + (widget.name ? '/' + widget.name : '');
              const state = widget.get_state();
              const children = state.children as unknown as [WidgetModel];
              if (children) {
                children.forEach((child, index) => {
                  iterateWidgets(mypath + '/' + index, child.model_id);
                });
              }
              // console.log('show widget model', path, widget.get_state());
              wRegistry.registerModel(mypath, widget.model_id);
              console.log(
                'model registred',
                mypath,
                widget.model_id /*, state, widget*/
              );
            } else {
              console.log('model missing', widget_model_id);
              pendingModels.push({ path, widget_model_id });
            }
          };
          /* const labWidgetManager = widgetManager as LabWidgetManager;

          if (labWidgetManager) {
            labWidgetManager.restored.connect(lWManager => {
              // we may be able to continue for some missing widgets
              console.log('RESTORED');
              const stillPendingModels: {
                path: string;
                widget_model_id: string;
              }[] = [];
              while (pendingModels.length > 0) {
                const pModel = pendingModels.pop();
                if (!pModel) {
                  break;
                }
                if (widgetManager?.has_model(pModel.widget_model_id)) {
                  console.log('Resume model search', pModel.path);
                  iterateWidgets(pModel.path, pModel.widget_model_id);
                } else {
                  stillPendingModels.push(pModel);
                }
              }
              pendingModels.push(...stillPendingModels);
            });
          } */

          const onCellsChanged = (cell: ICellModel) => {
            if (!trackedCells.has(cell)) {
              trackedCells.add(cell);
              const updateMimedata = () => {
                if (cell.type === 'code') {
                  // now we figure out, if all widgets are registered
                  const sharedModel = cell.sharedModel as ISharedCodeCell;
                  let index = 0;
                  for (const output of sharedModel.outputs) {
                    const appPath = cell.id + '/' + index;
                    let addPath = false;
                    // tag all sharedmodels with the path
                    switch (output.output_type) {
                      case 'display_data':
                      case 'update_display_data':
                      case 'execute_result':
                        {
                          const result = output as
                            | IExecuteResult
                            | IDisplayUpdate
                            | IDisplayData;

                          console.log('Mimebundle', result.data); // to do parse this also
                          console.log('Metadata', result.metadata);
                          console.log('Result', result);
                          const mimebundle = result.data;
                          if (mimebundle[widgetsMime]) {
                            const { model_id } = mimebundle[widgetsMime] as {
                              model_id: string;
                            };
                            iterateWidgets(appPath, model_id);
                          }
                          if (mimebundle['application/vnd.plotly.v1+json']) {
                            const bundle =
                              mimebundle['application/vnd.plotly.v1+json'];
                            console.log('Plotly bundle', bundle);
                            console.log('plotly cell', cell);
                            if ((<any>result.metadata).appPath !== appPath) {
                              (<any>result.metadata).appPath = appPath;
                              addPath = true;
                            }
                          }
                        }
                        break;

                      case 'stream':
                      case 'error':
                      default:
                    }
                    if (addPath) {
                      // should happen only once
                      sharedModel.updateOutputs(index, index + 1, [output]);
                      console.log('addpath');
                    }
                    index++;
                  }
                }
              };

              cell.contentChanged.connect(updateMimedata);
              updateMimedata();
            }
          };
          for (const cell of notebookModel.cells) {
            onCellsChanged(cell);
          }
          notebookModel.cells.changed.connect((cellist, changedList) => {
            const { /*newIndex,*/ newValues /* oldIndex, oldValues, type */ } =
              changedList;
            newValues.forEach(newcell => {
              onCellsChanged(newcell);
              // console.log('changed cells', newcell);
            });
          });
        }
      });
    }
  );
}

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
      new Private.AppletViewToolbarExtension(app.commands, toolbarItems)
    );
  },
  optional: []
};

const appletWidgetInterceptor: JupyterFrontEndPlugin<void> = {
  id: '@fails-components/jupyter-applet-widget:interceptor',
  description: 'Tracks and intercepts widget communication',
  autoStart: false,
  activate: activateWidgetInterceptor,
  requires: [INotebookTracker, IRenderMimeRegistry],
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
const plugins: (JupyterFrontEndPlugin<void> | JupyterLiteServerPlugin<any>)[] =
  [];
plugins.push(
  // all JupyterFrontEndPlugins
  appletView,
  appletViewToolbar,
  appletWidgetInterceptor,
  failsLauncher
);

const failsContentsPlugin: JupyterLiteServerPlugin<IContents> = {
  id: '@fails-components/jupyter-fails-server:contents',
  requires: [],
  autoStart: true,
  provides: IContents,
  activate: (app: JupyterLiteServer) => {
    if (app.namespace !== 'JupyterLite Server') {
      console.log('Not on server');
    }
    console.log('FAILS IContents');
    const contents = new Private.FailsContents();
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
    const settings = new Private.FailsSettings();
    app.started.then(() => settings.initialize().catch(console.warn));
    return settings;
  }
};

plugins.push(
  // all JupyterLiteServerPlugins
  failsContentsPlugin,
  failsSettingsPlugin
);

export default plugins;

/**
 * A namespace for module private functionality.
 */
namespace Private {
  const jsonMime = 'application/json';
  const proxyName = 'proxy.ipynb';
  export class FailsContents implements IContents {
    constructor() {
      this._ready = new PromiseDelegate();
    }

    get ready(): Promise<void> {
      return this._ready.promise;
    }

    async initialize() {
      this._ready.resolve(void 0);
    }

    async get(
      path: string,
      options?: ServerContents.IFetchOptions
    ): Promise<ServerContents.IModel | null> {
      // remove leading slash
      path = decodeURIComponent(path.replace(/^\//, ''));

      const serverFile = {
        name: proxyName,
        path: proxyName,
        last_modified: new Date(0).toISOString(),
        created: new Date(0).toISOString(),
        format: 'json' as ServerContents.FileFormat,
        mimetype: jsonMime,
        content: JSON.parse(this._fileContent),
        size: 0,
        writable: true,
        type: 'notebook'
      };

      if (path === '') {
        // the local directory, return the info about the proxy notebook

        return {
          name: '',
          path,
          last_modified: new Date(0).toISOString(),
          created: new Date(0).toISOString(),
          format: 'json',
          mimetype: jsonMime,
          content: [serverFile],
          size: 0,
          writable: true,
          type: 'directory'
        };
      }
      if (path === proxyName) {
        return serverFile;
      }
      return null; // not found
    }

    async save(
      path: string,
      options: Partial<ServerContents.IModel> = {}
    ): Promise<ServerContents.IModel | null> {
      path = decodeURIComponent(path);
      if (path !== proxyName) {
        // we only allow the proxy object
        return null;
      }
      const chunk = options.chunk;
      const chunked = chunk ? chunk > 1 || chunk === -1 : false;

      let item: ServerContents.IModel | null = await this.get(path, {
        content: chunked
      });

      if (!item) {
        return null;
      }

      const modified = new Date().toISOString();
      // override with the new values
      item = {
        ...item,
        ...options,
        last_modified: modified
      };

      if (options.content && options.format === 'base64') {
        const lastChunk = chunk ? chunk === -1 : true;

        const modified = new Date().toISOString();
        // override with the new values
        item = {
          ...item,
          ...options,
          last_modified: modified
        };

        const originalContent = item.content;
        const escaped = decodeURIComponent(escape(atob(options.content)));
        const newcontent = chunked ? originalContent + escaped : escaped;
        item = {
          ...item,
          content: lastChunk ? JSON.parse(newcontent) : newcontent,
          format: 'json',
          type: 'notebook',
          size: newcontent.length
        };
        this._fileContent = JSON.stringify(newcontent); // no parsing
        return item;
      }

      this._fileContent = JSON.stringify(item.content); // no parsing
      return item;
    }

    // For fails creating a new file is not allowed, so no need to implment it
    async newUntitled(
      options?: ServerContents.ICreateOptions
    ): Promise<ServerContents.IModel | null> {
      throw new Error('NewUntitled not implemented');
    }

    async rename(
      oldLocalPath: string,
      newLocalPath: string
    ): Promise<ServerContents.IModel> {
      throw new Error('rename not implemented');
    }

    async delete(path: string): Promise<void> {
      throw new Error('delete not implemented');
    }

    async copy(path: string, toDir: string): Promise<ServerContents.IModel> {
      throw new Error('copy not implemented');
    }

    async createCheckpoint(
      path: string
    ): Promise<ServerContents.ICheckpointModel> {
      throw new Error('createCheckpoint not (yet?) implemented');
    }

    async listCheckpoints(
      path: string
    ): Promise<ServerContents.ICheckpointModel[]> {
      // throw new Error('listCheckpoints not (yet?) implemented');
      return [
        { id: 'fakeCheckpoint', last_modified: new Date().toISOString() }
      ];
    }

    async restoreCheckpoint(path: string, checkpointID: string): Promise<void> {
      throw new Error('restoreCheckpoint not (yet?) implemented');
    }

    async deleteCheckpoint(path: string, checkpointID: string): Promise<void> {
      throw new Error('deleteCheckpoint not (yet?) implemented');
    }

    static EMPTY_NB = {
      metadata: {
        orig_nbformat: 4
      },
      nbformat_minor: 4,
      nbformat: 4,
      cells: []
    };

    private _ready: PromiseDelegate<void>;
    private _fileContent: string = JSON.stringify(FailsContents.EMPTY_NB);
  }

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
          const raw =
            /*((await storage.getItem(id)) as string) ?? */ plugin.raw;
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

  export class OutputAreaModelRemoteSender {
    constructor({
      port,
      model
    }: {
      port: MessagePort;
      model: IOutputAreaModel;
    }) {
      this._remotePort = port;
      this._model = model;
      this._remotePort.onmessage = this._onmessage.bind(this);
      this._remotePort.postMessage({
        task: 'initialState',
        json: this._model.toJSON()
      });
      this._model.changed.connect(this._modelChanged, this);
    }

    _onmessage(event: MessageEvent) {
      const data = event.data;
      switch (data.task) {
        case 'changedArgs':
          {
            const {
              name,
              newValue /* , oldValue*/
            }: IChangedArgs<any, any, string> = data.state;
            switch (name) {
              case 'trusted':
                {
                  const ourOldValue = this._model.trusted;
                  if (ourOldValue !== newValue) {
                    this._model.trusted = newValue;
                  }
                }
                break;
              default:
                console.log('Unknown changed args', name);
            }
          }
          break;
      }
    }

    _modelChanged(
      model: IOutputAreaModel,
      changed: IOutputAreaModel.ChangedArgs
    ) {
      const { type, newIndex, newValues, oldIndex, oldValues } = changed;
      console.log('model change');
      this._remotePort.postMessage({
        task: 'changedModel',
        type,
        newIndex,
        oldIndex,
        newValues: newValues.map((el: IOutputModel) => ({
          json: el.toJSON(),
          trusted: el.trusted
        })),
        oldValues: oldValues.map((el: IOutputModel) => ({
          json: el.toJSON(),
          trusted: el.trusted
        }))
      });
    }

    private _remotePort: MessagePort;
    private _model: IOutputAreaModel;
  }

  export class CellModelRemoteSender {
    constructor({ port, model }: { port: MessagePort; model: ICellModel }) {
      this._remotePort = port;
      this._model = model;

      this._remotePort.onmessage = this._onmessage.bind(this);

      this._remotePort.postMessage({
        task: 'initialState',
        state: {
          id: model.id,
          isDisposed: model.isDisposed,
          metadata: model.metadata,
          mimeType: model.mimeType,
          trusted: model.trusted,
          type: model.type
        }
      });

      this._model.mimeTypeChanged.connect(this._mimeTypeChanged, this);
      this._model.stateChanged.connect(this._stateChanged, this);
      this._model.contentChanged.connect(this._contentChanged, this);
      this._model.metadataChanged.connect(this._metadataChanged, this);
    }

    _onmessage(event: MessageEvent) {
      const data = event.data;
      switch (data.task) {
        case 'changedArgs':
          {
            const {
              name,
              newValue /* , oldValue*/
            }: IChangedArgs<any, any, string> = data.state;
            switch (name) {
              case 'mimeType':
                {
                  const ourOldValue = this._model.mimeType;
                  if (ourOldValue !== newValue) {
                    this._model.mimeType = newValue;
                  }
                }
                break;
              case 'trusted':
                {
                  const ourOldValue = this._model.trusted;
                  if (ourOldValue !== newValue) {
                    this._model.trusted = newValue;
                  }
                }
                break;
              default:
                console.log('Unknown changed args', name);
            }
          }
          break;
        case 'metadataChanged':
          {
            const { type, key, newValue /* , oldValue */ } =
              data.changed as IMapChange<any>;

            switch (type) {
              case 'change':
              case 'add':
                {
                  this._model.setMetadata(key, newValue);
                }
                break;
              case 'remove':
                {
                  this._model.deleteMetadata(key);
                }
                break;
            }
          }
          break;
        case 'dispose':
          {
            this._model.dispose();
            this._remotePort.close();
          }
          break;
      }
    }

    _mimeTypeChanged(
      model: CodeEditor.IModel,
      changed: IChangedArgs<string, string, string>
    ) {
      const { name, newValue, oldValue } = changed;
      this._remotePort.postMessage({
        task: 'changedArgs',
        name,
        newValue,
        oldValue
      });
    }

    _stateChanged(model: ICellModel, changed: IChangedArgs<any, any, string>) {
      const { name, newValue, oldValue } = changed;
      this._remotePort.postMessage({
        task: 'changedArgs',
        name,
        newValue,
        oldValue
      });
    }

    _contentChanged(model: ICellModel, changed: void) {
      this._remotePort.postMessage({
        task: 'contentChanged'
      });
    }

    _metadataChanged(model: ICellModel, changed: IMapChange<any>) {
      this._remotePort.postMessage({ task: 'metadataChanged', changed });
    }

    private _remotePort: MessagePort;
    private _model: ICellModel;
  }

  export class OutputAreaModelRemote implements IOutputAreaModel {
    constructor({ port }: { port: MessagePort }) {
      this._remotePort = port;
      this._remotePort.onmessage = this.onmessage.bind(this);
      this._model = new OutputAreaModel();
      console.log('remote hook');
    }

    onmessage(event: MessageEvent) {
      const data = event.data;
      switch (data.task) {
        case 'initialState':
        case 'updateState':
          {
            this._model.fromJSON(data.json);
          }
          break;
        case 'changedModel':
          {
            const {
              type,
              newIndex,
              newValues: newValuesJson,
              oldIndex,
              oldValues: oldValuesJson
            } = data as IObservableList.IChangedArgs<{
              json: IOutput;
              trusted: boolean;
            }>;
            console.log(
              'inspect new and old values json',
              newValuesJson,
              oldValuesJson
            );
            const newValues = newValuesJson.map(({ json: value, trusted }) =>
              this._model.contentFactory.createOutputModel({ value, trusted })
            );
            const oldValues = oldValuesJson.map(({ json: value, trusted }) =>
              this._model.contentFactory.createOutputModel({ value, trusted })
            );
            const list = this._model['list'] as IObservableList<IOutputModel>;
            switch (type) {
              case 'add':
                {
                  if (oldIndex === -2) {
                    // insert
                    list.insertAll(newIndex, newValues);
                  } else if (oldIndex === -1) {
                    // push
                    list.pushAll(newValues);
                  }
                }
                break;
              case 'set':
                {
                  list.set(newIndex, newValues[0]);
                }
                break;
              case 'remove':
                {
                  if (newValues.length === 0) {
                    list.clear();
                  } else if (newIndex === -1) {
                    if (oldValues.length === 1) {
                      list.remove(oldIndex);
                    } else {
                      list.removeRange(oldIndex, oldIndex + oldValues.length);
                    }
                  }
                }
                break;
              case 'move':
                {
                  list.move(oldIndex, newIndex);
                }
                break;
            }
          }
          break;
      }
    }

    get changed(): ISignal<IOutputAreaModel, IOutputAreaModel.ChangedArgs> {
      return this._model.changed;
    }

    get length(): number {
      return this._model.length;
    }

    get stateChanged(): ISignal<IOutputAreaModel, number> {
      return this._model.stateChanged;
    }

    get isDisposed(): boolean {
      return this._model.isDisposed;
    }

    get trusted(): boolean {
      return this._model.trusted;
    }

    set trusted(value: boolean) {
      throw new Error('set trusted to sender to implemented');
      // this._model.trusted = value;
    }

    get contentFactory(): IOutputAreaModel.IContentFactory {
      return this._model.contentFactory;
    }

    dispose(): void {
      throw new Error('dispose to sender to implemented');
      // this._model.dispose;
    }

    get(index: number) {
      return this._model.get(index);
    }

    set(index: number, output: IOutput): void {
      throw new Error('set to sender to implemented');
      // return this._model.set(index, output);
    }

    add(output: IOutput): number {
      throw new Error('add to sender to implemented');
      // return this._model.add(output);
    }

    clear(wait?: boolean) {
      throw new Error('ckear to sender to implemented');
      // return this._model.clear(wait);
    }

    toJSON(): IOutput[] {
      return this._model.toJSON();
    }

    fromJSON(values: IOutput[]): void {
      throw new Error('fromJSON to sender to implemented');
    }

    private _remotePort: MessagePort;
    private _model: OutputAreaModel;
  }

  export class CellModelRemote implements ICellModel {
    constructor({ port }: { port: MessagePort }) {
      this._remotePort = port;

      this._remotePort.onmessage = this.onmessage.bind(this);
      this._disposed = false;
      this._trusted = false;
    }

    onmessage(event: MessageEvent) {
      const data = event.data;
      switch (data.task) {
        case 'initialState':
          {
            const {
              id,
              isDisposed,
              metadata,
              mimeType,
              trusted,
              type
            }: {
              id?: string;
              isDisposed?: boolean;
              metadata?: Omit<IBaseCellMetadata, 'trusted'>;
              mimeType?: string;
              trusted?: boolean;
              type?: string;
            } = data.state;
            this._id = id ?? this._id;
            this._disposed = isDisposed ?? this._disposed;
            this._metadata = metadata ?? this._metadata;
            this._mimeType = mimeType ?? this._mimeType;
            this._trusted = trusted ?? this._trusted;
            this._type = type ?? this._type;
          }
          break;
        case 'changedArgs':
          {
            const { name, newValue, oldValue }: IChangedArgs<any, any, string> =
              data.state;
            switch (name) {
              case 'mimeType':
                {
                  const ourOldValue = this._mimeType;
                  if (ourOldValue !== newValue) {
                    this._mimeType = newValue;
                    this._mimeTypeChanged.emit({
                      name: 'mimeType',
                      oldValue,
                      newValue
                    });
                  }
                }
                break;
              case 'trusted':
                {
                  const ourOldValue = this._trusted;
                  if (ourOldValue !== newValue) {
                    this._trusted = newValue;
                    this._stateChanged.emit({
                      name: 'trusted',
                      oldValue: ourOldValue,
                      newValue: newValue as boolean
                    });
                  }
                }
                break;
              case 'isDirty':
              case 'executionCount':
              case 'executionState':
                {
                  this._stateChanged.emit({
                    name,
                    oldValue: oldValue,
                    newValue: newValue
                  });
                }
                break;
              default:
                console.log('Unknown changed args', name);
            }
          }
          break;
        case 'contentChanged':
          {
            this._contentChanged.emit();
          }
          break;
        case 'metadataChanged':
          {
            const { type, key, newValue /*, oldValue */ } =
              data.changed as IMapChange<any>;
            if (typeof this._metadata === 'undefined') {
              this._metadata = {};
            }
            switch (type) {
              case 'add':
                {
                  this._metadata[key] = newValue;
                  this._metadataChanged.emit({
                    type,
                    key,
                    newValue
                  });
                }
                break;
              case 'remove':
                {
                  if (this._metadata[key]) {
                    delete this._metadata[key];
                    this._metadataChanged.emit({
                      type,
                      key
                    });
                  }
                }
                break;
              case 'change':
                {
                  const ourOldValue = this._metadata[key];
                  if (newValue !== ourOldValue) {
                    this._metadata[key] = newValue;
                    this._metadataChanged.emit({
                      type,
                      key,
                      newValue,
                      oldValue: ourOldValue
                    });
                  }
                }
                break;
            }
          }
          break;
      }
    }

    get id(): string {
      if (typeof this._id === 'undefined') {
        throw new Error('id not transfered');
      }
      return this._id;
    }

    get type(): string {
      if (typeof this._type === 'undefined') {
        throw new Error('type not transfered');
      }
      return this._type;
    }

    get trusted(): boolean {
      return this._trusted;
    }

    set trusted(newValue: boolean) {
      const oldValue = this.trusted;
      if (oldValue === newValue) {
        return;
      }
      this._trusted = newValue;
      this._stateChanged.emit({
        name: 'trusted',
        oldValue,
        newValue
      });
      this._remotePort.postMessage({
        task: 'changedArgs',
        name: 'trusted',
        newValue,
        oldValue
      });
    }

    get mimeType(): string {
      return this._mimeType;
    }

    get selections(): IObservableMap<CodeEditor.ITextSelection[]> {
      throw new Error('Selections is not implemented');
    }

    get mimeTypeChanged(): ISignal<this, IChangedArgs<string>> {
      return this._mimeTypeChanged;
    }

    get sharedModel():
      | (ISharedCodeCell & ISharedText)
      | (ISharedRawCell & ISharedText)
      | (ISharedMarkdownCell & ISharedText)
      | (ISharedUnrecognizedCell & ISharedText) {
      throw new Error('Remote shared model is not implemented');
    }

    get isDisposed(): boolean {
      return this._disposed;
    }

    set mimeType(newValue: string) {
      const oldValue = this.mimeType;
      if (oldValue === newValue) {
        return;
      }
      this._mimeType = newValue;
      this._mimeTypeChanged.emit({
        name: 'mimeType',
        oldValue,
        newValue
      });
      this._remotePort.postMessage({
        task: 'changedArgs',
        name: 'mimeType',
        newValue,
        oldValue
      });
    }

    get stateChanged(): Signal<
      this,
      IChangedArgs<
        any,
        any,
        'isDirty' | 'trusted' | 'executionCount' | 'executionState'
      >
    > {
      return this._stateChanged;
    }

    get contentChanged(): Signal<this, void> {
      return this._contentChanged;
    }

    get metadataChanged(): Signal<this, IMapChange<any>> {
      return this._metadataChanged;
    }

    get metadata(): Omit<IBaseCellMetadata, 'trusted'> {
      if (typeof this._metadata === 'undefined') {
        return {};
      }
      return { ...this._metadata };
    }

    getMetadata(key: string): any {
      if (typeof this._metadata === 'undefined') {
        throw new Error('metadata not transfered');
      }
      return this._metadata[key];
    }

    setMetadata(key: string, value: any): void {
      if (this._metadata && this._metadata[key] === value) {
        return;
      }
      if (typeof this._metadata === 'undefined') {
        this._metadata = {};
      }
      const changed = {
        type: this._metadata[key] ? 'change' : 'add',
        key,
        oldValue: this._metadata[key] ?? undefined,
        newValue: value
      };
      this._metadata[key] = value;
      this._remotePort.postMessage({ task: 'metadataChanged', changed });
    }

    deleteMetadata(key: string): void {
      if (this._metadata && !this._metadata[key]) {
        return;
      }
      if (typeof this._metadata === 'undefined') {
        this._metadata = {};
      }
      const changed = {
        type: 'delete',
        key,
        oldValue: this._metadata[key] ?? undefined
      };
      delete this._metadata[key];
      this._remotePort.postMessage({ task: 'metadataChanged', changed });
    }

    toJSON(): ICell {
      throw new Error('toJSON not implemented for remote execution');
    }

    dispose(): void {
      this._remotePort.postMessage({
        task: 'dispose'
      });
      this._remotePort.close(); // do we need this?
    }

    private _remotePort: MessagePort;
    private _id: string | undefined;
    private _disposed: boolean;
    private _metadata: Omit<IBaseCellMetadata, 'trusted'> | undefined;
    private _mimeType: string = 'text/plain';
    private _trusted: boolean;
    private _type: string | undefined;
    private _contentChanged = new Signal<this, void>(this);
    private _mimeTypeChanged = new Signal<this, IChangedArgs<string>>(this);
    private _metadataChanged = new Signal<this, IMapChange<any>>(this);
    private _stateChanged = new Signal<
      this,
      IChangedArgs<
        any,
        any,
        'isDirty' | 'trusted' | 'executionCount' | 'executionState'
      >
    >(this);
  }

  interface IViewPartBase extends AppletViewOutputArea.IAppletPart {
    added?: boolean;
    clone?: Widget;
  }

  interface IViewPart extends IViewPartBase {
    added?: boolean;
    clone?: Widget;
    cloned: ISignal<IViewPart, void>;
  }

  interface IViewApplet {
    appid: string;
    parts: IViewPart[];
  }

  /**
   * A widget hosting applet views
   */
  export class AppletViewOutputArea extends AccordionPanel {
    constructor(options: AppletViewOutputArea.IOptions) {
      super();
      const trans = (options.translator || nullTranslator).load('jupyterlab');
      this._notebook = options.notebook;
      if (options.applets !== undefined) {
        this._applets = options.applets.map(({ parts, appid }) => ({
          appid: appid ?? UUID.uuid4(),
          parts: parts.map(
            el =>
              new AppletViewOutputAreaPart({
                index: el.index !== undefined ? el.index : -1,
                cell: el.cell || undefined,
                notebook: this._notebook
              })
          )
        }));
      } else {
        this._applets = [{ parts: [], appid: UUID.uuid4() }];
      }
      this.id = `AppletView-${UUID.uuid4()}`;
      this.title.label = 'Applets Preview';
      this.title.icon = notebookIcon;
      this.title.caption = this._notebook.title.label
        ? trans.__('For Notebook: %1', this._notebook.title.label)
        : trans.__('For Notebook:');
      this.addClass('fl-jp-AppletView');

      // Wait for the notebook to be loaded before
      // cloning the output area.
      void this._notebook.context.ready.then(() => {
        this._applets.forEach(({ parts, appid }) => {
          // TODO: Count applets
          console.log('parts loop before');
          parts.forEach(part => {
            if (!part.cell && typeof part.index !== 'undefined') {
              part.cell = this._notebook.content.widgets[part.index] as Cell;
              console.log('Inspect part cell');
              const codeCell = part.cell as CodeCell;
              const outputAreaModel: IOutputAreaModel =
                codeCell.outputArea.model;
              for (let i = 0; i < outputAreaModel.length; i++) {
                const cur = outputAreaModel.get(i);
                console.log('Output model:', i, cur);
                cur.changed.connect(() => {
                  console.log('Model changed', i, cur, outputAreaModel.get(i));
                });
              }
            }
            if (!part.cell /* || part.cell.model.type !== 'code' */) {
              // this.dispose(); // no dispose, just do not add
              return;
            }
            if (part.added) {
              return; // already added
            }
            part.clone = this.addCell(
              appid,
              part.cell,
              part.id || 'undefinedid'
            );
            if (part.cell.model.type === 'code') {
              let managerProm: Promise<LabWidgetManager> | undefined;
              for (const codecell of (part.cell as CodeCell).outputArea
                .widgets) {
                // We use Array.from instead of using Lumino 2 (JLab 4) iterator
                // This is to support Lumino 1 (JLab 3) as well
                for (const output of Array.from(codecell.children())) {
                  if (output instanceof WidgetRenderer) {
                    if (output['_manager']) {
                      managerProm = output['_manager'].promise;
                    }
                  }
                }
              }
              managerProm?.then(manager => {
                for (const codecell of (part.clone as OutputArea).widgets) {
                  for (const output of Array.from(codecell.children())) {
                    if (output instanceof WidgetRenderer) {
                      output.manager = manager;
                    }
                  }
                }
              });
            }
          });
        });
        this._viewChanged.emit();
      });
    }

    cloneCell(cell: Cell, cellid: string): Widget {
      if (cell.model.type === 'code') {
        const codeCell = cell as CodeCell;
        const clone = codeCell.cloneOutputArea();
        // code for remote model
        /*
        const channel = new MessageChannel();
        new OutputAreaModelRemoteSender({
          port: channel.port1,
          model: codeCell.model.outputs!
        });
        // console.log('debug simplified');
        const clone = new SimplifiedOutputArea({
          // model: codeCell.model.outputs!,
          model: new OutputAreaModelRemote({
            port: channel.port2
          }),
          contentFactory: codeCell.contentFactory,
          rendermime: codeCell['_rendermime']
        });*/
        // @ts-expect-error cellid does not exist on type
        clone.cellid = cellid;
        // @ts-expect-error cellid does not exist on type
        clone.widgetid = UUID.uuid4();
        return clone;
      } else {
        const clone = cell.clone();
        // @ts-expect-error cellid does not exist on type
        clone.cellid = cellid;
        // @ts-expect-error cellid does not exist on type
        clone.widgetid = UUID.uuid4();
        return clone;
      }
    }

    getWidgetAppId(widgetid: string): string | undefined {
      const index = this.widgets.findIndex(el =>
        // @ts-expect-error widgetid does not exist on type
        Array.from(el.children()).some(el => el.widgetid === widgetid)
      );
      if (index === -1) {
        return;
      }
      return this._applets[index].appid;
    }

    addCell(appid: string, cell: Cell, cellid: string): Widget {
      const appIndex = this._applets.findIndex(
        applet => applet.appid === appid
      );
      if (appIndex === -1) {
        throw new Error('Applet not found in addcell');
      }
      const app = this.widgets[appIndex] as Panel;
      const clone = this.cloneCell(cell, cellid);
      app.addWidget(clone);
      return clone;
    }

    insertCell(
      appid: string,
      index: number,
      cell: Cell,
      cellid: string
    ): Widget | undefined {
      const appIndex = this._applets.findIndex(
        applet => applet.appid === appid
      );
      if (appIndex === -1) {
        return;
      }
      const clone = this.cloneCell(cell, cellid);
      const app = this.widgets[appIndex] as Panel;
      const layout = app.layout as BoxLayout;
      layout.insertWidget(index, clone);
      return clone;
    }

    deletePart(appid: string, cellid: string) {
      const appIndex = this._applets.findIndex(
        applet => applet.appid === appid
      );
      if (appIndex === -1) {
        return;
      }
      const applet = this._applets[appIndex];
      const todeleteIndex = applet.parts.findIndex(part => part.id === cellid);
      if (todeleteIndex === -1) {
        return;
      }
      console.log('delete debug 0', applet.parts.map(el => el.id).join(','));
      applet.parts.splice(todeleteIndex, 1);

      const app = this.widgets[appIndex];
      const layout = app.layout as BoxLayout;
      console.log('delete debug 1', applet.parts.map(el => el.id).join(','));

      layout.removeWidgetAt(todeleteIndex);

      // trigger an update ?
      this._viewChanged.emit();
    }

    movePart(appid: string, cellid: string, delta: number) {
      const appIndex = this._applets.findIndex(
        applet => applet.appid === appid
      );
      if (appIndex === -1) {
        return;
      }
      const applet = this._applets[appIndex];
      const tomoveIndex = applet.parts.findIndex(part => part.id === cellid);
      if (tomoveIndex === -1) {
        return;
      }
      if (tomoveIndex + delta < 0) {
        return;
      }
      if (tomoveIndex + delta >= applet.parts.length) {
        return;
      }
      console.log('move me debug 0', applet.parts.map(el => el.id).join(','));
      const [moveme] = applet.parts.splice(tomoveIndex, 1);
      console.log('move me debug 1', applet.parts.map(el => el.id).join(','));
      applet.parts.splice(
        tomoveIndex + delta + (delta > 1 ? -1 : 0),
        0,
        moveme
      );
      console.log('move me debug 2', applet.parts.map(el => el.id).join(','));
      const app = this.widgets[appIndex] as Panel;
      const layout = app.layout as BoxLayout;
      layout.insertWidget(tomoveIndex + delta, layout.widgets[tomoveIndex]);
      // trigger an update ?
      this._viewChanged.emit();
    }
    /*
    canMoveApp(appid: string, cellid: string, delta: number): boolean {
      console.log('canmoveapp debug');
      const appIndex = this._applets.findIndex(
        applet => applet.appid === appid
      );
      if (appIndex + delta < 0) {
        return false;
      }
      if (appIndex + delta >= this._applets.length) {
        // only add new apps, if current app will not be empty
        if (this._applets[appIndex].parts.length <= 1) {
          return false;
        }
      }
      return true;
    }
*/
    moveApp(appid: string, cellid: string, delta: number) {
      console.log('move app debug');
      const appIndex = this._applets.findIndex(
        applet => applet.appid === appid
      );
      if (appIndex === -1) {
        return;
      }
      const applet = this._applets[appIndex];
      const partIndex = applet.parts.findIndex(part => part.id === cellid);
      if (partIndex === -1) {
        return;
      }
      if (delta === 0) {
        return;
      }
      if (appIndex + delta < 0) {
        return;
      }
      if (appIndex + delta >= this._applets.length) {
        // only add new apps, if current app will not be empty
        if (this._applets[appIndex].parts.length <= 1) {
          return false;
        }
        // in this case we create a new app
        this.addApplet({ appid: UUID.uuid4() });
      }
      const destApplet = this._applets[appIndex + delta];
      if (destApplet.parts.some(el => el.id === cellid)) {
        // per convention an elment can not be added twice to an app
        return;
      }
      let destPartIndex = 0;
      if (delta < 0) {
        destPartIndex = destApplet.parts.length;
      }
      /*console.log(
        'app move me debug 0',
        applet.parts.map(el => el.id).join(',')
      );
      console.log(
        'app move me debug 0 dst',
        destApplet.parts.map(el => el.id).join(',')
      );*/
      const [moveme] = applet.parts.splice(partIndex, 1); // remove

      destApplet.parts.splice(destPartIndex, 0, moveme);
      /* console.log(
        'app move me debug 1',
        applet.parts.map(el => el.id).join(',')
      );
      console.log(
        'app move me debug 1 dst',
        destApplet.parts.map(el => el.id).join(',')
      );*/
      const srcApp = this.widgets[appIndex] as Panel;
      const destApp = this.widgets[appIndex + delta] as Panel;
      const srcLayout = srcApp.layout as BoxLayout;
      const destLayout = destApp.layout as BoxLayout;
      const widget = srcLayout.widgets[partIndex];
      destLayout.insertWidget(destPartIndex, widget);
      // srcLayout.removeWidgetAt(partIndex); // not necessary
      if (appIndex === this._applets.length - 1 && applet.parts.length === 0) {
        // if the last applet is empty, we remove it
        this._applets.splice(appIndex, 1);
        const appSrcLayout = this.layout as BoxLayout;
        appSrcLayout.removeWidgetAt(appIndex);
      }
      // trigger an update ?
      this._viewChanged.emit();
    }

    /*
     * The index of cells in the notebooks
     */
    /* get indices() {
      return this._parts.map(part => part.index);
    } */

    saveData() {
      const applets = this._applets.map(applet => ({
        parts: applet.parts.map(part => ({
          index: part.index,
          id: part.id
        })),
        appid: applet.appid
      }));
      return { applets };
    }

    loadData(data: any): void {
      if (!data) {
        return;
      }
      console.log('load data ready', data);
      let applets = data.applets as AppletViewOutputArea.IApplet[];
      if (data.parts && typeof applets === 'undefined') {
        applets = [{ appid: UUID.uuid4(), parts: data.parts }];
      }
      if (
        !Array.isArray(applets) ||
        applets.some(({ parts }) => !Array.isArray(parts))
      ) {
        return;
      }
      for (const applet of applets) {
        const appid = applet.appid ?? UUID.uuid4();
        this.addApplet({ appid });
        for (const part of applet.parts) {
          console.log('loaddata', part);
          if (part.index || part.id) {
            this.addPart(appid, {
              index: part.index,
              id: part.id
            });
          }
        }
      }
    }

    addApplet({ appid }: { appid: string }): Panel {
      // figure out, if it is already added
      let appletIndex = this._applets.findIndex(
        applet => applet.appid === appid
      );
      if (appletIndex !== -1) {
        return this.widgets[appletIndex] as Panel;
      }
      // TODO add element to widgets
      appletIndex = this._applets.length;
      this._applets.push({ appid, parts: [] });
      const layout = this.layout as PanelLayout;
      const panel = new Panel({});
      BoxLayout.setStretch(panel, 1);
      panel.addClass('fl-jp-Applet');
      panel.title.label = 'Applet ' + this._applets.length;
      panel.title.caption = panel.title.label;
      layout.insertWidget(appletIndex, panel);

      return panel;
    }

    addPart(
      appidOrUndefined: string | undefined,
      part: AppletViewOutputArea.IAppletPart
    ) {
      const topush: IViewPart = new AppletViewOutputAreaPart({
        index: part.index !== undefined ? part.index : -1,
        cell: part.cell || undefined,
        id: part.id || undefined,
        notebook: this._notebook
      });
      let appletIndex =
        typeof appidOrUndefined === 'undefined'
          ? 0
          : this._applets.findIndex(
              applet => applet.appid === appidOrUndefined
            );
      if (appletIndex === -1) {
        appletIndex = 0;
      }
      const appid = this._applets[appletIndex].appid;

      const applet = this._applets[appletIndex];
      console.log('applet parts', applet);
      // we need to figure out, if it is already added
      if (
        applet.parts.some(
          el =>
            el.id === topush.id ||
            (typeof el.cell !== 'undefined' && el.cell === topush.cell)
        )
      ) {
        return;
      }
      this._notebook.content.model?.cells.changed.connect(
        (sender: CellList) => {
          for (const cell of sender) {
            if (cell.id === topush.id) {
              // we found it and are happy that it is still there
              // but is it still the same
              const index = ArrayExt.findFirstIndex(
                this._notebook.content.widgets,
                wcell => wcell === topush.cell
              );
              if (index !== -1) {
                return;
              } // still the same cell
              const oldclone = topush.clone;
              const partind = applet.parts.indexOf(topush); // our position in the list
              const newindex = ArrayExt.findFirstIndex(
                this._notebook.content.widgets,
                wcell => wcell.id === topush.cell?.id
              );
              if (newindex === -1) {
                throw new Error('Cell does not exist');
              }
              topush.cell = this._notebook.content.widgets[newindex] as Cell;
              oldclone?.dispose();
              topush.clone = this.insertCell(
                applet.appid,
                partind,
                topush.cell,
                topush.id
              );

              return;
            }
          }
          // not found case, it is gone forever so remove from parts and dispose
          const appIndex = this._applets.findIndex(
            applet => applet.appid === appid
          );
          if (appIndex === -1) {
            return;
          }
          const apps = this._applets[appIndex];
          const ind = apps.parts.indexOf(topush);
          if (ind !== -1) {
            console.log(
              'addpart gone  part 0',
              applet.parts.map(el => el.id).join(',')
            );
            apps.parts.splice(ind, 1);
            console.log(
              'addpart gone  part 1',
              applet.parts.map(el => el.id).join(',')
            );
          }
          topush.clone?.dispose();
        }
      );
      applet.parts.push(topush);
      if (this._notebook.context.isReady) {
        // it is already ready, so we can not rely on the global code for adding to the view
        if (!topush.cell && part.index) {
          topush.cell = this._notebook.content.widgets[part.index] as CodeCell;
        }
        if (topush.cell) {
          topush.clone = this.addCell(
            appid,
            topush.cell,
            topush.id || 'undefinedid'
          );
        }
      }
      // trigger an update ?
      this._viewChanged.emit();
    }

    firstHasIndex(index: number): boolean {
      if (this._applets.length === 0) {
        return false;
      }
      return this._applets[0].parts.some(el => el.index === index);
    }

    /* hasId(id: string): boolean {
      return this._parts.some(el => el.id === id);
    } */

    get applets(): IViewApplet[] {
      return this._applets;
    }

    /**
     * The index of the cell in the notebook.
     */
    /*
    get index(): number {
      return this._cell
        ? ArrayExt.findFirstIndex(
            this._notebook.content.widgets,
            c => c === this._cell
          )
        : this._index;
    }
    */

    /**
     * The path of the notebook for the cloned output area.
     */
    get path(): string {
      return this._notebook.context.path;
    }

    get viewChanged(): ISignal<this, void> {
      return this._viewChanged;
    }

    private _notebook: NotebookPanel;
    private _applets: IViewApplet[];
    private _viewChanged = new Signal<this, void>(this);
  }

  interface IAppletPartOptions extends IViewPartBase {
    notebook: NotebookPanel;
  }

  export interface IAppletViewOutputAreasStore {
    [key: string]: AppletViewOutputArea;
  }

  export interface IAppletViewMainAreaWidgetStore {
    [key: string]: MainAreaWidget<Private.AppletViewOutputArea>;
  }

  /**
   * AppletViewOutputArea statics.
   */
  export namespace AppletViewOutputArea {
    export interface IAppletPart {
      /**
       * The cell for which to clone the output area.
       */
      cell?: Cell;

      /**
       * The cell id to uniquely identify the cell
       */
      id?: string;

      /**
       * The cell index if the id is not set yet
       */
      index?: number;
    }
    export interface IApplet {
      appid?: string; // should be always, present, but if not it is randomly generated
      parts: IAppletPart[];
    }

    export interface IOptions {
      /**
       * The notebook associated with the cloned output area.
       */
      notebook: NotebookPanel;

      applets: IApplet[];

      translator?: ITranslator;
    }
  }

  class AppletViewOutputAreaPart implements AppletViewOutputArea.IAppletPart {
    constructor(args: IAppletPartOptions) {
      this._cell = args.cell;
      this._index = args.index || -1;
      this._id = args.id || this._cell?.model.id;
      this._notebook = args.notebook;
    }

    /**
     * The index of the cell in the notebook.
     */
    get index(): number {
      if (this._id) {
        return ArrayExt.findFirstIndex(
          this._notebook.content.widgets,
          c => c.model.id === this._id
        );
      }
      return this._cell
        ? ArrayExt.findFirstIndex(
            this._notebook.content.widgets,
            c => c === this._cell
          )
        : this._index;
    }

    get cell(): Cell | undefined {
      return this._cell;
    }

    set cell(value: Cell | undefined) {
      console.log('debug cell assign', value?.model.id, this._id);
      if (value?.model.id !== this._id) {
        throw new Error('Can not assign a cell with different id');
      }
      this._cell = value;
    }

    get added(): boolean {
      return !!this._clone;
    }

    get id(): string | undefined {
      return this._id;
    }

    set clone(value: Widget | undefined) {
      this._clone = value;
      console.log('clone emit');
      this._cloned.emit(); // inform that we have been cloned
    }

    get clone(): Widget | undefined {
      return this._clone;
    }

    get path(): string {
      return this._notebook.context.path;
    }

    get cloned(): ISignal<this, void> {
      return this._cloned;
    }

    private _cell: Cell | undefined;
    private _id: string | undefined;
    private _index: number;
    private _notebook: NotebookPanel;
    private _clone: Widget | undefined;
    private _cloned = new Signal<this, void>(this);
  }

  export class SplitViewNotebookPanel extends NotebookPanel {
    constructor(options: DocumentWidget.IOptions<Notebook, INotebookModel>) {
      super(options);
      // now we have to do the following
      // 1. remove this._content from the layout
      const content = this['_content'];
      const layout = this.layout as BoxLayout;
      layout.removeWidget(content);
      // 2. add a BoxLayout instead
      const splitPanel = new SplitPanel({
        spacing: 1,
        orientation: 'horizontal'
      });
      BoxLayout.setStretch(splitPanel, 1);

      // 3. add content to the BoxLayout, as well as a applet view area
      splitPanel.addWidget(content);
      const widget = (this._appletviewWidget = new AppletViewOutputArea({
        notebook: this,
        applets: [],
        translator: options.translator
      }));
      splitPanel.addWidget(widget);
      layout.addWidget(splitPanel);
    }

    get appletViewWidget() {
      return this._appletviewWidget;
    }
    /*
    private _splitPanel: SplitPanel; */
    private _appletviewWidget: AppletViewOutputArea;
  }

  export class SplitViewNotebookWidgetFactory extends NotebookWidgetFactory {
    protected createNewWidget(
      context: DocumentRegistry.IContext<INotebookModel>,
      source?: NotebookPanel
    ): SplitViewNotebookPanel {
      console.log('Create new Widget intercepted');
      // copied from basis object
      const translator = (context as any).translator;
      const kernelHistory = new NotebookHistory({
        sessionContext: context.sessionContext,
        translator: translator
      });
      const nbOptions = {
        rendermime: source
          ? source.content.rendermime
          : this.rendermime.clone({ resolver: context.urlResolver }),
        contentFactory: this.contentFactory,
        mimeTypeService: this.mimeTypeService,
        editorConfig: source
          ? source.content.editorConfig
          : (this['_editorConfig'] as StaticNotebook.IEditorConfig),
        notebookConfig: source
          ? source.content.notebookConfig
          : (this['_notebookConfig'] as StaticNotebook.INotebookConfig),
        translator,
        kernelHistory
      };
      const content = this.contentFactory.createNotebook(nbOptions);
      return new SplitViewNotebookPanel({ context, content });
    }
  }

  class AppletViewToolbarTracker implements IDisposable {
    /**
     * AppletViewToolbarTracker constructor
     *
     * @param view The Applet View area
     * @param toolbarFactory The toolbar factory
     */
    constructor(
      notebookpanel: SplitViewNotebookPanel,
      toolbarFactory: (
        widget: Widget
      ) => IObservableList<ToolbarRegistry.IToolbarItem>
    ) {
      console.log('Tracker area', notebookpanel);
      this._notebookpanel = notebookpanel;
      this._toolbarFactory = toolbarFactory ?? null;

      // Only add the toolbar to the notebook's active cell (if any) once it has fully rendered and been revealed.

      void notebookpanel.revealed.then(() => {
        requestAnimationFrame(() => {
          this._notebookpanel?.appletViewWidget.viewChanged.connect(
            this._addToolbar,
            this
          );
          console.log('first add toolbar');
          this._addToolbar();
          console.log('first add toolbar end');
        });
      });
    }

    dispose(): void {
      if (this.isDisposed) {
        return;
      }
      this._isDisposed = true;

      this._toolbarStore.forEach(tb => tb.dispose());
      this._toolbarStore = [];
      this._toolbars = new WeakMap<IViewPart, Toolbar>();

      this._notebookpanel = null;

      Signal.clearData(this);
    }

    get isDisposed(): boolean {
      return this._isDisposed;
    }

    private _addToolbar(): void {
      const notebookpanel = this._notebookpanel;

      if (notebookpanel && !notebookpanel.isDisposed) {
        console.log('really addToolbar');
        const promises: Promise<void>[] = [
          /*notebookpanel.ready*/
        ]; // remove area ready
        const applets = notebookpanel.appletViewWidget?.applets;

        const doAddToolbar = (part: IViewPart) => {
          const clone = part.clone;
          if (clone) {
            console.log('parts mark 1');
            // eslint-disable-next-line no-constant-condition
            const toolbarWidget = new Toolbar();
            this._toolbars.set(part, toolbarWidget);
            this._toolbarStore.push(toolbarWidget);
            // Note: CELL_MENU_CLASS is deprecated.
            toolbarWidget.addClass('fl-jp-AppletViewToolbar'); // implement MR
            if (this._toolbarFactory) {
              console.log('before settoolbar');
              // ts-expect-error Widget has no toolbar
              // clone.toolbar = toolbarWidget;

              setToolbar(clone, this._toolbarFactory, toolbarWidget);
            }
          }
        };

        for (const applet of applets) {
          for (const part of applet.parts) {
            const clone = part.clone;
            console.log('parts clone', clone, part);
            if (!this._toolbars.has(part)) {
              if (clone) {
                // eslint-disable-next-line no-constant-condition
                doAddToolbar(part);
              } else {
                // we have to defer it
                const slot = () => {
                  console.log('slot clone called');
                  doAddToolbar(part);
                  part.cloned.disconnect(slot);
                };
                part.cloned.connect(slot);
                this._toolbars.set(part, null);
              }
            }
            // FIXME toolbarWidget.update() - strangely this does not work
          }
        }

        // promises.push(area.ready); // remove?

        // Wait for all the buttons to be rendered before attaching the toolbar.
        Promise.all(promises)
          .then(() => {
            for (const applet of applets) {
              for (const part of applet.parts) {
                const toolbarWidget = this._toolbars.get(part);
                if (!toolbarWidget) {
                  continue;
                }
                if (!part.clone || part.clone.isDisposed) {
                  continue;
                }
                const clone = part.clone;
                if (clone) {
                  console.log('PanelLayout?', clone!.layout);
                  // (clone!.layout as PanelLayout).insertWidget(0, toolbarWidget);
                  (clone!.layout as PanelLayout).addWidget(toolbarWidget);
                }
              }
            }

            // For rendered markdown, watch for resize events.
            // area.displayChanged.connect(this._resizeEventCallback, this); // remove?

            // Watch for changes in the cell's contents.
            // area.model.contentChanged.connect(this._changedEventCallback, this); ?

            // Hide the cell toolbar if it overlaps with cell contents
            // this._updateCellForToolbarOverlap(area); // remove?
          })
          .catch(e => {
            console.error('Error rendering buttons of the cell toolbar: ', e);
          });
      }
    }

    private _isDisposed = false;
    private _notebookpanel: SplitViewNotebookPanel | null;
    private _toolbars = new WeakMap<IViewPart, Toolbar | null>();
    private _toolbarStore: Toolbar[] = [];
    private _toolbarFactory: (
      widget: Widget
    ) => IObservableList<ToolbarRegistry.IToolbarItem>;
  }

  const defaultToolbarItems: ToolbarRegistry.IWidget[] = [
    {
      command: 'fails-components-jupyter-applet-view:move_view_up',
      name: 'move-view-up'
    },
    {
      command: 'fails-components-jupyter-applet-view:move_view_down',
      name: 'move-view-down'
    },
    {
      command: 'fails-components-jupyter-applet-view:move_view_app_up',
      name: 'move-view-app-up'
    },
    {
      command: 'fails-components-jupyter-applet-view:move_view_app_down',
      name: 'move-view-app-down'
    },
    {
      command: 'fails-components-jupyter-applet-view:delete_view',
      name: 'delete-view'
    }
  ];

  // a lot of code taken from Jupyter labs CellBarExtension
  export class AppletViewToolbarExtension
    implements DocumentRegistry.WidgetExtension
  {
    static readonly FACTORY_NAME = 'AppletView';

    constructor(
      commands: CommandRegistry,
      toolbarFactory?: (
        widget: Widget
      ) => IObservableList<ToolbarRegistry.IToolbarItem>
    ) {
      this._commands = commands;
      console.log('peek toolbar factory', toolbarFactory);
      // # TODO we have to make sure, we get the default, how can we do this?
      this._toolbarFactory = toolbarFactory ?? this.defaultToolbarFactory;
    }

    protected get defaultToolbarFactory(): (
      widget: Widget
    ) => IObservableList<ToolbarRegistry.IToolbarItem> {
      const itemFactory = createDefaultFactory(this._commands);
      console.log('default toolbar fetch!');
      return (widget: Widget) =>
        new ObservableList({
          values: defaultToolbarItems.map(item => {
            // console.log('widget? factory', widget);
            const applet = widget.parent as Widget;
            const parent = applet.parent as AppletViewOutputArea;
            const path = parent.path;
            return {
              name: item.name,
              widget: itemFactory(
                AppletViewToolbarExtension.FACTORY_NAME,
                widget,
                {
                  ...item,
                  args: {
                    // @ts-expect-error cellid is not part of Widget
                    cellid: widget.cellid,
                    notepadpath: path,
                    // @ts-expect-error appid is not part of Widget
                    widgetid: widget.widgetid
                  }
                }
              )
            };
          })
        });
    }

    createNew(panel: SplitViewNotebookPanel): IDisposable {
      console.log('createNew', panel);
      return new AppletViewToolbarTracker(panel, this._toolbarFactory);
    }

    private _commands: CommandRegistry;
    private _toolbarFactory: (
      widget: Widget
    ) => IObservableList<ToolbarRegistry.IToolbarItem>;
  }
}
