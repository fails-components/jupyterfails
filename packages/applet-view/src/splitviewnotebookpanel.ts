import { DocumentRegistry, DocumentWidget } from '@jupyterlab/docregistry';
import {
  NotebookPanel,
  Notebook,
  INotebookModel,
  NotebookHistory,
  NotebookWidgetFactory,
  StaticNotebook
} from '@jupyterlab/notebook';
import { BoxLayout, SplitPanel } from '@lumino/widgets';
import { AppletViewOutputArea } from './avoutputarea';
import { IFailsLauncherInfo } from './index';

interface IAppletResizeEvent {
  appid: string;
  width: number;
  height: number;
}

export class SplitViewNotebookPanel extends NotebookPanel {
  constructor(
    options: DocumentWidget.IOptions<Notebook, INotebookModel>,
    failsLauncherInfo: IFailsLauncherInfo | undefined
  ) {
    super(options);
    this._failsLauncherInfo = failsLauncherInfo;
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
      applets: undefined,
      translator: options.translator
    }));
    splitPanel.addWidget(widget);
    layout.addWidget(splitPanel);
    // move to separate handler
    if (failsLauncherInfo?.inLecture) {
      this.toolbar.hide();
      this.addClass('fl-jl-notebook-inlecture');
      this._appletviewWidget.inLecture = true;
      splitPanel.setRelativeSizes([0, 1]); // change sizes
    }
    if (failsLauncherInfo) {
      failsLauncherInfo.inLectureChanged.connect(
        (sender: IFailsLauncherInfo, newInLecture: boolean) => {
          if (newInLecture) {
            this.toolbar.hide();
            this.addClass('fl-jl-notebook-inlecture');
            this._appletviewWidget.inLecture = true;
            content.hide()
            splitPanel.setRelativeSizes([0, 1]); // change sizes
          } else {
            this.toolbar.show();
            this.removeClass('fl-jl-notebook-inlecture');
            this._appletviewWidget.inLecture = false;
            content.show()
            splitPanel.setRelativeSizes([1, 1]); // change sizes
            widget.unselectApplet();
          }
        }
      );
      failsLauncherInfo.selectedAppidChanged.connect(
        (sender: IFailsLauncherInfo, appid: string | undefined) => {
          if (typeof appid !== 'undefined') {
            widget.selectApplet(appid);
          }
        }
      );
    }
    const metadataUpdater = () => {
      const { failsApp, kernelspec } = this.context.model.metadata;
      if (failsLauncherInfo?.reportMetadata) {
        failsLauncherInfo.reportMetadata({ failsApp, kernelspec });
      }
    };
    this.context.model.metadataChanged.connect(metadataUpdater);
    metadataUpdater();
  }

  appletResizeinfo({ appid, width, height }: IAppletResizeEvent) {
    if (this._failsLauncherInfo) {
      this._failsLauncherInfo.appletSizes[appid] = { appid, width, height };
    }
  }

  get appletViewWidget() {
    return this._appletviewWidget;
  }
  /*
    private _splitPanel: SplitPanel; */
  private _appletviewWidget: AppletViewOutputArea;
  private _failsLauncherInfo: IFailsLauncherInfo | undefined;
}
namespace SplitViewNotebookWidgetFactory {
  export interface IOptions
    extends NotebookWidgetFactory.IOptions<NotebookPanel> {
    failsLauncherInfo?: IFailsLauncherInfo;
  }
}

export class SplitViewNotebookWidgetFactory extends NotebookWidgetFactory {
  constructor(options: SplitViewNotebookWidgetFactory.IOptions) {
    super(options);
    this._failsLauncherInfo = options.failsLauncherInfo;
  }
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
    return new SplitViewNotebookPanel(
      {
        context,
        content
      },
      this._failsLauncherInfo
    );
  }

  private _failsLauncherInfo: IFailsLauncherInfo | undefined;
}
