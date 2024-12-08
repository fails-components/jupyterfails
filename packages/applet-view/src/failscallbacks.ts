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

export interface IFailsCallbacks {
  callContents?: (event: IContentEventType) => Promise<any>;
  postMessageToFails?: (message: any, transfer?: Transferable[]) => void;
}
