import { Contents, Drive, ServerConnection } from '@jupyterlab/services';
import { ISignal, Signal } from '@lumino/signaling';

interface IContentEvent {
  task: string;
}

export interface ILoadJupyterContentEvent extends IContentEvent {
  task: 'loadFile';
  fileData: object | undefined;
  fileName: string;
}

export interface ISavedJupyterContentEvent extends IContentEvent {
  task: 'savedFile';
  fileName: string;
}

export type IContentEventType =
  | ILoadJupyterContentEvent
  | ISavedJupyterContentEvent; // use union

// portions used from Jupyterlab:
/* -----------------------------------------------------------------------------
| Copyright (c) Jupyter Development Team.
| Distributed under the terms of the Modified BSD License.
|----------------------------------------------------------------------------*/
// This code contains portions from or is inspired by Jupyter lab and lite
// especially the Drive implementation

const jsonMime = 'application/json';
type IModel = Contents.IModel;

export class FailsDrive implements Contents.IDrive {
  constructor(options: Drive.IOptions) {
    this._serverSettings =
      options.serverSettings ?? ServerConnection.makeSettings();
  }

  dispose(): void {
    if (this.isDisposed) {
      return;
    }
    this._isDisposed = true;
    Signal.clearData(this);
  }

  get isDisposed(): boolean {
    return this._isDisposed;
  }

  get name(): string {
    return 'JupyterFailsSingleFileDrive';
  }

  get serverSettings(): ServerConnection.ISettings {
    return this._serverSettings;
  }

  get fileChanged(): ISignal<Contents.IDrive, Contents.IChangedArgs> {
    return this._fileChanged;
  }

  async getDownloadUrl(path: string): Promise<string> {
    throw new Error('Method not implemented.');
  }

  async onMessage(event: IContentEventType): Promise<any> {
    // todo handle events
    switch (event.task) {
      case 'loadFile':
        {
          const loadevent = event as ILoadJupyterContentEvent;
          this._fileContent = JSON.stringify(
            loadevent.fileData || FailsDrive.EMPTY_NB
          );
          this._fileName = loadevent.fileName;
          this._fileChanged.emit({
            type: 'save',
            oldValue: null,
            newValue: {
              name: this._fileName,
              path: this._fileName,
              last_modified: new Date(0).toISOString(),
              created: new Date(0).toISOString(),
              format: 'json' as Contents.FileFormat,
              mimetype: jsonMime,
              content: JSON.parse(this._fileContent),
              size: 0,
              writable: true,
              type: 'notebook'
            }
          });
        }
        break;
      case 'savedFile':
        {
          const savedevent = event as ISavedJupyterContentEvent;
          if (this._fileName !== savedevent.fileName) {
            return { error: 'Filename not found' };
          }
          return {
            fileData: JSON.parse(this._fileContent)
          };
        }
        break;
    }
  }

  async get(path: string, options?: Contents.IFetchOptions): Promise<IModel> {
    // remove leading slash
    path = decodeURIComponent(path.replace(/^\//, ''));

    const serverFile = {
      name: this._fileName,
      path: this._fileName,
      last_modified: new Date(0).toISOString(),
      created: new Date(0).toISOString(),
      format: 'json' as Contents.FileFormat,
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
    if (path === this._fileName) {
      return serverFile;
    }
    throw Error(`Could not find content with path ${path}`);
  }

  async save(
    path: string,
    options: Partial<Contents.IModel> = {}
  ): Promise<Contents.IModel> {
    path = decodeURIComponent(path);
    if (path !== this._fileName) {
      // we only allow the proxy object
      throw Error(`File ${path} is not the proxy file`);
    }
    const chunk = options.chunk;
    const chunked = chunk ? chunk > 1 || chunk === -1 : false;

    let item: Contents.IModel | null = await this.get(path, {
      content: chunked
    });

    if (!item) {
      throw Error(`Could not find file with path ${path}`);
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
      this._fileChanged.emit({
        type: 'save',
        oldValue: null,
        newValue: item
      });
      return item;
    }

    this._fileContent = JSON.stringify(item.content); // no parsing
    this._fileChanged.emit({
      type: 'save',
      oldValue: null,
      newValue: item
    });
    return item;
  }

  // For fails creating a new file is not allowed, so no need to implment it
  async newUntitled(options?: Contents.ICreateOptions): Promise<IModel> {
    throw new Error('NewUntitled not implemented');
  }

  async rename(oldLocalPath: string, newLocalPath: string): Promise<IModel> {
    throw new Error('rename not implemented');
  }

  async delete(path: string): Promise<void> {
    throw new Error('delete not implemented');
  }

  async copy(path: string, toDir: string): Promise<IModel> {
    throw new Error('copy not implemented');
  }

  async createCheckpoint(path: string): Promise<Contents.ICheckpointModel> {
    throw new Error('createCheckpoint not (yet?) implemented');
  }

  async listCheckpoints(path: string): Promise<Contents.ICheckpointModel[]> {
    // throw new Error('listCheckpoints not (yet?) implemented');
    return [{ id: 'fakeCheckpoint', last_modified: new Date().toISOString() }];
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
    nbformat_minor: 5,
    nbformat: 4,
    cells: []
  };

  private _fileContent: string = JSON.stringify(FailsDrive.EMPTY_NB);
  private _isDisposed = false;
  private _fileChanged = new Signal<Contents.IDrive, Contents.IChangedArgs>(
    this
  );
  private _fileName: string = 'unloaded.ipynb';
  private _serverSettings: ServerConnection.ISettings;
}
