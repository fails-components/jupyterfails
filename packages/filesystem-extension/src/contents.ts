import { Contents as ServerContents } from '@jupyterlab/services';
import { IContents } from '@jupyterlite/contents';
import { PromiseDelegate } from '@lumino/coreutils';

// portions used from Jupyterlab:
/* -----------------------------------------------------------------------------
| Copyright (c) Jupyter Development Team.
| Distributed under the terms of the Modified BSD License.
|----------------------------------------------------------------------------*/
// This code contains portions from or is inspired by Jupyter lab and lite

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
    nbformat_minor: 4,
    nbformat: 4,
    cells: []
  };

  private _ready: PromiseDelegate<void>;
  private _fileContent: string = JSON.stringify(FailsContents.EMPTY_NB);
}
