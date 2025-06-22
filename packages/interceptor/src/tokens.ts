import { Token } from '@lumino/coreutils';

export interface IFailsInterceptor {
  isMimeTypeSupported: (mimeType: string) => boolean;
}

export const IFailsInterceptor = new Token<IFailsInterceptor>(
  '@fails-components/jupyter-fails:IFailsInterceptor',
  'A service to talk with FAILS interceptor.'
);
