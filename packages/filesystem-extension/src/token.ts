import { Token } from '@lumino/coreutils';
import { IContentEventType } from './drive';

export type IFailsDriveMessageHandler = (
  msg: IContentEventType
) => Promise<void> | void;
export interface IFailsDriveMessages {
  registerMessageHandler: (handler: IFailsDriveMessageHandler) => void;
  sendMessage: (msg: IContentEventType) => Promise<any>;
}

export const IFailsDriveMessages = new Token<IFailsDriveMessages>(
  '@fails-components/jupyter-fails:IFailsDriveMessages',
  'A service to communicate to the FAILS single file drive.'
);
