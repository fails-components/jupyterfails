import {
  IMapChange,
  ISharedCodeCell,
  ISharedMarkdownCell,
  ISharedRawCell,
  ISharedText,
  ISharedUnrecognizedCell
} from '@jupyter/ydoc';
import { ICellModel } from '@jupyterlab/cells';
import { CodeEditor } from '@jupyterlab/codeeditor';
import { IChangedArgs } from '@jupyterlab/coreutils';
import { IBaseCellMetadata, ICell, IOutput } from '@jupyterlab/nbformat';
import { IObservableList, IObservableMap } from '@jupyterlab/observables';
import { IOutputAreaModel, OutputAreaModel } from '@jupyterlab/outputarea';
import { IOutputModel } from '@jupyterlab/rendermime';
import { ISignal, Signal } from '@lumino/signaling';

export class OutputAreaModelRemoteSender {
  constructor({ port, model }: { port: MessagePort; model: IOutputAreaModel }) {
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
