import {
  IDefaultDrive,
  Contents,
  ServerConnection,
  Setting,
  ISettingManager,
  IServerSettings,
  ServiceManagerPlugin
} from '@jupyterlab/services';
import { FailsDrive, IContentEventType } from './drive';
import { FailsSettings } from './settings';
import { IFailsDriveMessageHandler, IFailsDriveMessages } from './token';

export * from './token';

const failsDriveMessages: ServiceManagerPlugin<IFailsDriveMessages> = {
  id: '@fails-components/jupyter-applet-widget:drivemessages',
  requires: [],
  autoStart: true,
  provides: IFailsDriveMessages,
  activate: (_: null) => {
    let initialWaitRes: ((val: unknown) => void) | undefined;
    const initialWait = new Promise(resolve => (initialWaitRes = resolve));
    let messageHandler: IFailsDriveMessageHandler;
    const driveMessages = {
      registerMessageHandler: (handler: IFailsDriveMessageHandler) => {
        messageHandler = handler;
        if (initialWaitRes) {
          initialWaitRes(undefined);
        }
        initialWaitRes = undefined;
      },
      sendMessage: async (msg: IContentEventType) => {
        await initialWait;
        return messageHandler(msg);
      }
    };
    return driveMessages;
  }
};

const failsDrivePlugin: ServiceManagerPlugin<Contents.IDrive> = {
  id: '@fails-components/jupyter-applet-widget:drive',
  requires: [IFailsDriveMessages],
  autoStart: true,
  provides: IDefaultDrive,
  activate: (_: null, driveMessages: IFailsDriveMessages) => {
    const drive = new FailsDrive({});
    driveMessages.registerMessageHandler(msg => drive.onMessage(msg));
    return drive;
  }
};

const failsSettingsPlugin: ServiceManagerPlugin<Setting.IManager> = {
  id: '@fails-components/jupyter-applet-widget:settings',
  requires: [],
  autoStart: true,
  provides: ISettingManager,
  optional: [IServerSettings],
  activate: (_: null, serverSettings: ServerConnection.ISettings | null) => {
    const settings = new FailsSettings({
      serverSettings: serverSettings ?? undefined
    });
    return settings;
  }
};

const plugins: ServiceManagerPlugin<any>[] = [
  failsDriveMessages,
  failsDrivePlugin,
  failsSettingsPlugin
];

export default plugins;
