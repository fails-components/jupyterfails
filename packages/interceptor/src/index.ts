import {
  INotebookTracker,
  NotebookPanel,
  INotebookModel
} from '@jupyterlab/notebook';
import {
  JupyterFrontEnd,
  JupyterFrontEndPlugin
} from '@jupyterlab/application';
import { IWidgetManager, WidgetModel } from '@jupyter-widgets/base';
import {
  IExecuteResult,
  IDisplayData,
  IDisplayUpdate
} from '@jupyterlab/nbformat';
import {
  IRenderMime,
  IRenderMimeRegistry,
  RenderMimeRegistry
} from '@jupyterlab/rendermime';
import { ICellModel } from '@jupyterlab/cells';
import { ISharedCodeCell } from '@jupyter/ydoc';
import { JSONObject, PromiseDelegate } from '@lumino/coreutils';
import { Kernel } from '@jupyterlab/services';

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

const appletWidgetInterceptor: JupyterFrontEndPlugin<void> = {
  id: '@fails-components/jupyter-applet-widget:interceptor',
  description: 'Tracks and intercepts widget communication',
  autoStart: false,
  activate: activateWidgetInterceptor,
  requires: [INotebookTracker, IRenderMimeRegistry],
  optional: []
};

const plugins: JupyterFrontEndPlugin<void>[] = [appletWidgetInterceptor];

export default plugins;
