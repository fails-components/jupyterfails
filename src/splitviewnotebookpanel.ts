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