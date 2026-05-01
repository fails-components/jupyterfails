import type {
  Contents,
  ServerConnection,
  Setting,
  ServiceManagerPlugin
} from '@jupyterlab/services';
import {
  IDefaultDrive,
  ISettingManager,
  IServerSettings
} from '@jupyterlab/services';
import type { IContentEventType } from './drive';
import { FailsDrive } from './drive';
import { FailsSettings } from './settings';
import type { IFailsDriveMessageHandler } from './token';
import { IFailsDriveMessages } from './token';

export * from './token';

const failsDriveMessages: ServiceManagerPlugin<IFailsDriveMessages> = {
  id: '@fails-components/jupyter-applet-widget:drivemessages',
  requires: [],
  autoStart: true,
  provides: IFailsDriveMessages,
  description:
    'IFailsDriveMessages interface to send/receive messages for the drive',
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
  description:
    'Supplies a drive object for Jupyter lite to be fed from outisde the iframe',
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
  description: 'ISettingsManager from the IFrame embeeded Jupyter',
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
