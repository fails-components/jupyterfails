import { JupyterFrontEnd, ILayoutRestorer } from '@jupyterlab/application';
import { Cell } from '@jupyterlab/cells';
import { IDocumentManager } from '@jupyterlab/docmanager';
import {
  INotebookTracker,
  NotebookWidgetFactory,
  NotebookTracker,
  NotebookPanel
} from '@jupyterlab/notebook';
import { RestorablePool } from '@jupyterlab/statedb';
import { ITranslator } from '@jupyterlab/translation';
import {
  addIcon,
  moveUpIcon,
  moveDownIcon,
  caretUpIcon,
  caretDownIcon,
  deleteIcon
} from '@jupyterlab/ui-components';
import { ReadonlyPartialJSONObject } from '@lumino/coreutils';
import { SplitViewNotebookWidgetFactory } from './splitviewnotebookpanel';
import { SplitViewNotebookPanel } from './splitviewnotebookpanel';
import { IFailsLauncherInfo } from './index';
import { IFailsInterceptor } from '@fails-components/jupyter-interceptor';

// portions used from Jupyterlab:
/* -----------------------------------------------------------------------------
| Copyright (c) Jupyter Development Team.
| Distributed under the terms of the Modified BSD License.
|----------------------------------------------------------------------------*/
// This code contains portions from or is inspired by Jupyter lab's notebook extension, especially the createOutputView part
// Also a lot is taken from the cell toolbar related parts.
export function activateAppletView(
  app: JupyterFrontEnd,
  docManager: IDocumentManager,
  notebookTracker: INotebookTracker,
  translator: ITranslator,
  restorer: ILayoutRestorer | null,
  failsLauncherInfo: IFailsLauncherInfo | null,
  failsInterceptor: IFailsInterceptor | null
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
    const factory = new SplitViewNotebookWidgetFactory({
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
      translator,
      failsLauncherInfo:
        failsLauncherInfo !== null ? failsLauncherInfo : undefined,
      failsInterceptor: failsInterceptor !== null ? failsInterceptor : undefined
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
        const currentSplitView = widget as SplitViewNotebookPanel;
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
          const currentSplitView = widget as SplitViewNotebookPanel;
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
      notebookTracker.currentWidget as SplitViewNotebookPanel;
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
      const currentSplitView = current as SplitViewNotebookPanel;
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
    const currentSplitView = current as SplitViewNotebookPanel;
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
    const currentSplitView = current as SplitViewNotebookPanel;
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
      const currentSplitView = current as SplitViewNotebookPanel;
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
