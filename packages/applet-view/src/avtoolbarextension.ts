import {
  ToolbarRegistry,
  createDefaultFactory,
  setToolbar
} from '@jupyterlab/apputils';
import { DocumentRegistry } from '@jupyterlab/docregistry';
import { IObservableList, ObservableList } from '@jupyterlab/observables';
import { CommandRegistry } from '@lumino/commands';
import { IDisposable } from '@lumino/disposable';
import { PanelLayout, Widget } from '@lumino/widgets';
import { SplitViewNotebookPanel } from './splitviewnotebookpanel';
import { AppletViewOutputArea, IViewPart } from './avoutputarea';
import { Toolbar } from '@jupyterlab/ui-components';
import { Signal } from '@lumino/signaling';
import { IFailsLauncherInfo } from '@fails-components/jupyter-launcher';

// portions used from Jupyterlab:
/* -----------------------------------------------------------------------------
| Copyright (c) Jupyter Development Team.
| Distributed under the terms of the Modified BSD License.
|----------------------------------------------------------------------------*/
// This code contains portions from or is inspired by Jupyter lab's notebook extension, especially the createOutputView part
// Also a lot is taken from the cell toolbar related parts.

export const defaultToolbarItems: ToolbarRegistry.IWidget[] = [
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
    launcherInfo: IFailsLauncherInfo | null,
    toolbarFactory?: (
      widget: Widget
    ) => IObservableList<ToolbarRegistry.IToolbarItem>
  ) {
    this._commands = commands;
    this._launcherInfo = launcherInfo;
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
    return new AppletViewToolbarTracker(
      panel,
      this._toolbarFactory,
      this._launcherInfo
    );
  }

  private _commands: CommandRegistry;
  private _toolbarFactory: (
    widget: Widget
  ) => IObservableList<ToolbarRegistry.IToolbarItem>;
  private _launcherInfo: IFailsLauncherInfo | null;
}
export class AppletViewToolbarTracker implements IDisposable {
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
    ) => IObservableList<ToolbarRegistry.IToolbarItem>,
    launcherInfo: IFailsLauncherInfo | null
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
        if (launcherInfo?.inLecture) {
          this._setHiddenToolbars(launcherInfo?.inLecture);
        }
        if (launcherInfo) {
          let hasToolbar = !launcherInfo?.inLecture;
          launcherInfo.inLectureChanged.connect(
            (sender: IFailsLauncherInfo, newInLecture: boolean) => {
              if (hasToolbar !== !newInLecture) {
                this._setHiddenToolbars(newInLecture);
                hasToolbar = !newInLecture;
              }
            }
          );
        }
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

  _setHiddenToolbars(hidden: boolean): void {
    const notebookpanel = this._notebookpanel;
    if (notebookpanel && !notebookpanel.isDisposed) {
      const applets = notebookpanel.appletViewWidget?.applets;
      for (const applet of applets) {
        for (const part of applet.parts) {
          const toolbarWidget = this._toolbars.get(part);
          if (!toolbarWidget) {
            continue;
          }
          toolbarWidget.setHidden(hidden);
        }
      }
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
