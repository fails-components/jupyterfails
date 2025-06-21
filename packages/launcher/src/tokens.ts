import { Token } from '@lumino/coreutils';
import { ISignal } from '@lumino/signaling';
import { JSONObject, PartialJSONObject } from '@lumino/coreutils';

export interface IAppletWidgetRegistry {}

export interface IFailsAppletSize {
  appid: string;
  width: number;
  height: number;
}

export interface IFailsLauncherInit {
  inLecture: boolean;
  selectedAppid: string | undefined;
  reportMetadata?: (metadata: PartialJSONObject) => void;
}

export interface IFailsInterceptorUpdateMessage {
  path: string;
  mime: string;
  state: JSONObject;
}

export interface IFailsLauncherInfo extends IFailsLauncherInit {
  inLectureChanged: ISignal<IFailsLauncherInfo, boolean>;
  selectedAppidChanged: ISignal<this, string | undefined>;
  appletSizes: { [key: string]: IFailsAppletSize };
  appletSizesChanged: ISignal<this, { [key: string]: IFailsAppletSize }>;
  updateMessageArrived?: ISignal<
    IAppletWidgetRegistry,
    IFailsInterceptorUpdateMessage
  >;
  remoteUpdateMessageArrived: ISignal<
    IFailsLauncherInfo,
    IFailsInterceptorUpdateMessage
  >;
}

export const IFailsLauncherInfo = new Token<IFailsLauncherInfo>(
  '@fails-components/jupyter-fails:IFailsLauncherInfo',
  'A service to communicate with FAILS.'
);
