import {
  LabWidgetManager,
  WidgetRenderer
} from '@jupyter-widgets/jupyterlab-manager';
import { Cell, CodeCell } from '@jupyterlab/cells';
import { CellList, NotebookPanel } from '@jupyterlab/notebook';
import { IOutputAreaModel, OutputArea } from '@jupyterlab/outputarea';
import { ITranslator, nullTranslator } from '@jupyterlab/translation';
import { notebookIcon } from '@jupyterlab/ui-components';
import { ArrayExt } from '@lumino/algorithm';
import { UUID } from '@lumino/coreutils';
import { ISignal, Signal } from '@lumino/signaling';
import {
  AccordionPanel,
  Widget,
  Panel,
  BoxLayout,
  PanelLayout,
  AccordionLayout,
  Title
} from '@lumino/widgets';
import { MainAreaWidget } from '@jupyterlab/apputils';
import { SplitViewNotebookPanel } from './splitviewnotebookpanel';

// portions used from Jupyterlab:
/* -----------------------------------------------------------------------------
| Copyright (c) Jupyter Development Team.
| Distributed under the terms of the Modified BSD License.
|----------------------------------------------------------------------------*/
// This code contains portions from or is inspired by Jupyter lab's notebook extension, especially the createOutputView part
// Also a lot is taken from the cell toolbar related parts.

/**
 * A widget hosting applet views
 */

export class AppletViewOutputArea extends AccordionPanel {
  constructor(options: AppletViewOutputArea.IOptions) {
    super({ renderer: new AppletViewRenderer() });
    const trans = (options.translator || nullTranslator).load('jupyterlab');
    this._notebook = options.notebook;
    this._inLecture = false;
    if (options.applets !== undefined) {
      this._applets = options.applets.map(
        ({ parts, appid: oldAppid, appname }, index) => {
          const appid = oldAppid ?? UUID.uuid4();
          return {
            appid,
            appname: appname || 'Applet ' + (index + 1),
            observer: new ResizeObserver(
              (entries: ResizeObserverEntry[], observer: ResizeObserver) =>
                this.resizeEvent(appid, entries, observer)
            ),
            parts: parts.map(
              el =>
                new AppletViewOutputAreaPart({
                  index: el.index ?? -1,
                  cell: el.cell || undefined,
                  notebook: this._notebook
                })
            )
          };
        }
      );
    } else {
      const appid = UUID.uuid4();
      this._applets = [];
      this.addApplet({ appid, appname: 'Applet 1' });
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
        const damagedParts: number[] = [];
        parts.forEach((part, index) => {
          if (
            !part.cell &&
            typeof part.index !== 'undefined' &&
            part.index >= 0
          ) {
            const currentcell = this._notebook.content.widgets[
              part.index
            ] as Cell;
            if (currentcell.model.id === part.id) {
              part.cell = currentcell;
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
            } else {
              // ok this looks like damaged data
              damagedParts.push(index);
            }
          }
          if (!part.cell /* || part.cell.model.type !== 'code' */) {
            // this.dispose(); // no dispose, just do not add
            return;
          }
          if (part.added) {
            return; // already added
          }
          part.clone = this.addCell(appid, part.cell, part.id || 'undefinedid');
          if (part.cell.model.type === 'code') {
            let managerProm: Promise<LabWidgetManager> | undefined;
            for (const codecell of (part.cell as CodeCell).outputArea.widgets) {
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
        if (damagedParts.length > 0) {
          // remove damaged items for the list
          for (let i = damagedParts.length - 1; i >= 0; i--) {
            parts.splice(damagedParts[i], 1);
          }
        }
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

  addToObserver(appIndex: number, widget: Widget) {
    const observer = this._applets[appIndex].observer;
    observer.observe(widget.node, { box: 'border-box' });
  }

  removeFromObserver(appIndex: number, widget: Widget) {
    const observer = this._applets[appIndex].observer;
    observer.unobserve(widget.node);
  }

  addCell(appid: string, cell: Cell, cellid: string): Widget {
    const appIndex = this._applets.findIndex(applet => applet.appid === appid);
    if (appIndex === -1) {
      throw new Error('Applet not found in addcell');
    }
    const app = this.widgets[appIndex] as Panel;
    const clone = this.cloneCell(cell, cellid);
    this.addToObserver(appIndex, clone);
    app.addWidget(clone);

    // this.informResize(this._applets[appIndex]) // not neccessary
    // trigger an update ?
    this._viewChanged.emit();
    return clone;
  }

  insertCell(
    appid: string,
    index: number,
    cell: Cell,
    cellid: string
  ): Widget | undefined {
    const appIndex = this._applets.findIndex(applet => applet.appid === appid);
    if (appIndex === -1) {
      return;
    }
    const clone = this.cloneCell(cell, cellid);
    const app = this.widgets[appIndex] as Panel;
    this.addToObserver(appIndex, clone);
    const layout = app.layout as BoxLayout;
    layout.insertWidget(index, clone);

    // this.informResize(this._applets[appIndex]) // not neccessary
    // trigger an update ?
    this._viewChanged.emit();
    return clone;
  }

  deletePart(appid: string, cellid: string) {
    const appIndex = this._applets.findIndex(applet => applet.appid === appid);
    if (appIndex === -1) {
      return;
    }
    const applet = this._applets[appIndex];
    const todeleteIndex = applet.parts.findIndex(part => part.id === cellid);
    if (todeleteIndex === -1) {
      return;
    }
    const removedPart = applet.parts.splice(todeleteIndex, 1);
    if (removedPart.length > 0) {
      const cell = removedPart[0].cell;
      if (typeof cell !== 'undefined') {
        this.removeFromObserver(appIndex, cell);
      }
    }

    const app = this.widgets[appIndex];
    const layout = app.layout as BoxLayout;

    layout.removeWidgetAt(todeleteIndex);

    this.informResize(this._applets[appIndex]);
    // trigger an update ?
    this._viewChanged.emit();
  }

  movePart(appid: string, cellid: string, delta: number) {
    const appIndex = this._applets.findIndex(applet => applet.appid === appid);
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
    const [moveme] = applet.parts.splice(tomoveIndex, 1);
    applet.parts.splice(tomoveIndex + delta + (delta > 1 ? -1 : 0), 0, moveme);
    const app = this.widgets[appIndex] as Panel;
    const layout = app.layout as BoxLayout;
    layout.insertWidget(tomoveIndex + delta, layout.widgets[tomoveIndex]);
    this.informResize(this._applets[appIndex]);
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
    const appIndex = this._applets.findIndex(applet => applet.appid === appid);
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
    this.removeFromObserver(appIndex, widget);
    this.addToObserver(appIndex + delta, widget);
    destLayout.insertWidget(destPartIndex, widget);
    // srcLayout.removeWidgetAt(partIndex); // not necessary
    if (appIndex === this._applets.length - 1 && applet.parts.length === 0) {
      // if the last applet is empty, we remove it
      this._applets.splice(appIndex, 1);
      const appSrcLayout = this.layout as BoxLayout;
      appSrcLayout.removeWidgetAt(appIndex);
    }
    this.informResize(this._applets[appIndex]);
    this.informResize(this._applets[appIndex + delta]);
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
      appid: applet.appid,
      appname: applet.appname
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
    // clear applets
    this._applets = [];
    if (this.layout) {
      (this.layout as PanelLayout).widgets.forEach((widget: Widget) =>
        this.layout?.removeWidget(widget)
      );
    }

    if (applets.length === 0) {
      // we need a minimum of 1 applet!
      const appid = UUID.uuid4();
      this.addApplet({ appid, appname: 'Applet 1' });
      return;
    }
    for (const applet of applets) {
      const appid = applet.appid ?? UUID.uuid4();
      const appname = applet.appname;
      this.addApplet({ appid, appname });
      if (
        typeof this._selectedAppid !== 'undefined' &&
        appid !== this._selectedAppid
      ) {
        this.collapse(this._applets.length - 1);
      }

      for (const part of applet.parts) {
        console.log('loaddata', part);
        if (typeof part.index !== 'undefined' || part.id) {
          this.addPart(appid, {
            index: part.index,
            id: part.id
          });
        }
      }
    }
  }

  addApplet({ appid, appname }: { appid: string; appname?: string }): Panel {
    // figure out, if it is already added
    let appletIndex = this._applets.findIndex(applet => applet.appid === appid);
    if (appletIndex !== -1) {
      return this.widgets[appletIndex] as Panel;
    }
    // TODO add element to widgets
    appletIndex = this._applets.length;
    appname = appname || 'Applet ' + Math.random().toString(36).slice(2, 6);
    this._applets.push({
      appid,
      appname: appname,
      observer: new ResizeObserver(
        (entries: ResizeObserverEntry[], observer: ResizeObserver) =>
          this.resizeEvent(appid, entries, observer)
      ),
      parts: []
    });
    const layout = this.layout as PanelLayout;
    const panel = new Panel({});
    BoxLayout.setStretch(panel, 1);
    panel.addClass('fl-jp-Applet');
    panel.title.label = appname;
    panel.title.caption = panel.title.label;
    panel.title.changed.connect((title: Title<Widget>) => {
      this._applets[appletIndex].appname = title.label;
      this._viewChanged.emit();
    });
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
        : this._applets.findIndex(applet => applet.appid === appidOrUndefined);
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
    this._notebook.content.model?.cells.changed.connect((sender: CellList) => {
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
    });
    applet.parts.push(topush);
    if (this._notebook.context.isReady) {
      // it is already ready, so we can not rely on the global code for adding to the view
      if (
        !topush.cell &&
        typeof part.index !== 'undefined' &&
        part.index >= 0
      ) {
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

  selectApplet(selectedAppid: string) {
    this._selectedAppid = selectedAppid;
    for (let i = 0; i < this._applets.length; i++) {
      const applet = this._applets[i];
      if (applet.appid === selectedAppid) {
        this.expand(i);
      } else {
        this.collapse(i);
      }
    }
  }

  unselectApplet() {
    for (let i = 0; i < this._applets.length; i++) {
      this.expand(i);
    }
  }

  informResize(applet: IViewApplet) {
    // inform about the new sizes
    let width = 0;
    let height = 0;
    for (const part of applet.parts) {
      if (typeof part.sizes === 'undefined') {
        continue;
      }
      const { width: ewidth, height: eheight } = part.sizes;
      height += eheight;
      width = Math.max(ewidth, width);
    }
    this._notebook.appletResizeinfo({
      appid: applet.appid,
      width,
      height
    });
  }

  resizeEvent(
    appid: string,
    entries: ResizeObserverEntry[],
    observer: ResizeObserver
  ): void {
    const applet = this._applets.find(applet => applet.appid === appid);
    if (typeof applet === 'undefined') {
      return;
    }
    let updated = false;
    for (const entry of entries) {
      const part = applet.parts.find(
        part => part?.clone?.node === entry.target
      );
      if (!part) {
        continue;
      }
      if (!entry.borderBoxSize[0]) {
        continue;
      }
      const size = entry.borderBoxSize[0];
      if (size.inlineSize === 0 || size.blockSize === 0) {
        continue;
      } // do not store collapsed values
      part.sizes = {
        width: size.inlineSize,
        height: size.blockSize
      };
      updated = true;
    }
    if (!updated) {
      return;
    }
    this.informResize(applet);
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

  set inLecture(value: boolean) {
    if (value === this._inLecture) {
      return;
    }
    this._inLecture = value;
    const splitLayout = this.layout as AccordionLayout;
    if (value) {
      splitLayout.titleSpace = 0;
    } else {
      splitLayout.titleSpace = 22;
    }
  }

  // override base class
  handleEvent(event: Event): void {
    if (event.type === 'click') {
      const target = event.target as HTMLElement;
      if (target.tagName === 'SPAN' || target.tagName === 'INPUT') {
        return;
      }
    }
    if (['keydown', 'keypress', 'keyup'].includes(event.type)) {
      const target = event.target as HTMLElement;
      if (target.tagName === 'INPUT') {
        return; // do not call preventDefault
      }
    }
    super.handleEvent(event);
  }

  private _notebook: SplitViewNotebookPanel;
  private _applets: IViewApplet[];
  private _selectedAppid: string | undefined;
  private _viewChanged = new Signal<this, void>(this);
  private _inLecture: boolean;
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
    appname?: string; // A user readable string identifiying the app
    parts: IAppletPart[];
  }

  export interface IOptions {
    /**
     * The notebook associated with the cloned output area.
     */
    notebook: SplitViewNotebookPanel;

    applets?: IApplet[];

    translator?: ITranslator;
  }
}
export interface IViewPartBase extends AppletViewOutputArea.IAppletPart {
  added?: boolean;
  clone?: Widget;
}
export interface IViewPartSize {
  width: number;
  height: number;
}

export interface IViewPart extends IViewPartBase {
  added?: boolean;
  clone?: Widget;
  cloned: ISignal<IViewPart, void>;
  sizes?: IViewPartSize;
}
export interface IViewApplet {
  appid: string;
  appname: string;
  parts: IViewPart[];
  observer: ResizeObserver;
}
export interface IAppletPartOptions extends IViewPartBase {
  notebook: NotebookPanel;
}
export interface IAppletViewOutputAreasStore {
  [key: string]: AppletViewOutputArea;
}
export interface IAppletViewMainAreaWidgetStore {
  [key: string]: MainAreaWidget<AppletViewOutputArea>;
}
export class AppletViewOutputAreaPart
  implements AppletViewOutputArea.IAppletPart
{
  constructor(args: IAppletPartOptions) {
    this._cell = args.cell;
    this._index = args.index ?? -1;
    this._id = args.id || this._cell?.model.id;
    this._notebook = args.notebook;
  }

  /**
   * The index of the cell in the notebook.
   */
  get index(): number {
    if (this._id) {
      const ind = ArrayExt.findFirstIndex(
        this._notebook.content.widgets,
        c => c.model.id === this._id
      );
      if (ind !== -1) {
        return ind;
      }
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

export class AppletViewRenderer extends AccordionPanel.Renderer {
  createSectionTitle(data: Title<Widget>): HTMLElement {
    const handle = document.createElement('h3');
    handle.setAttribute('tabindex', '0');
    handle.id = this.createTitleKey(data);
    handle.className = this.titleClassName;
    for (const aData in data.dataset) {
      handle.dataset[aData] = data.dataset[aData];
    }

    const collapser = handle.appendChild(this.createCollapseIcon(data));
    collapser.className = 'lm-AccordionPanel-titleCollapser';
    console.log('createSectiontitle');

    let title = data.caption || data.label;

    const staticLabel = document.createElement('span');
    staticLabel.className = 'lm-AccordionPanel-titleLabel';
    staticLabel.textContent = data.label;
    staticLabel.title = title;

    handle.appendChild(staticLabel);

    const editLabel = document.createElement('input');
    editLabel.className = 'lm-AccordionPanel-titleLabelEdit';
    editLabel.type = 'text';
    editLabel.value = data.label;
    editLabel.title = title;

    staticLabel.addEventListener('click', (ev: MouseEvent) => {
      handle.removeChild(staticLabel);
      handle.appendChild(editLabel);
    });
    editLabel.addEventListener('blur', (ev: FocusEvent) => {
      handle.removeChild(editLabel);
      handle.appendChild(staticLabel);
    });
    editLabel.addEventListener('keydown', (ev: KeyboardEvent) => {
      if (ev.key === 'Enter') {
        handle.removeChild(editLabel);
        handle.appendChild(staticLabel);
      }
      return true;
    });
    editLabel.addEventListener('change', event => {
      const target = event.target as HTMLInputElement | null;
      if (target === editLabel) {
        const newValue = target?.value;
        if (newValue && newValue !== title) {
          title = newValue;
          data.caption = title;
          data.label = title;
          staticLabel.title = title;
          staticLabel.textContent = title;
        }
      }
      handle.removeChild(editLabel);
      handle.appendChild(staticLabel);
    });

    return handle;
  }
}
