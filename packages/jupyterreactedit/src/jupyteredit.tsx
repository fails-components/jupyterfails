/*
    BSD 3-Clause License

    Copyright (c) 2024, Marten Richter
    All rights reserved.

    Redistribution and use in source and binary forms, with or without
    modification, are permitted provided that the following conditions are met:

    1. Redistributions of source code must retain the above copyright notice, this
      list of conditions and the following disclaimer.

    2. Redistributions in binary form must reproduce the above copyright notice,
      this list of conditions and the following disclaimer in the documentation
      and/or other materials provided with the distribution.

    3. Neither the name of the copyright holder nor the names of its
      contributors may be used to endorse or promote products derived from
      this software without specific prior written permission.

    THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS"
    AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
    IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
    DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE
    FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL
    DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR
    SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER
    CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY,
    OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
    OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
*/
import React, { Component, Fragment } from 'react';
import {
  IJupyterToFailsMessage,
  IFailsToJupyterMessage,
  IInterceptorUpdate,
  IReportFailsAppletSizes,
  IScreenShotOpts,
  IDocDirty,
  IFailsAppletSize,
  IGDPRProxyInfo
} from '@fails-components/jupyter-launcher';
import { JSONObject, PartialJSONObject } from '@lumino/coreutils';
import '../style/index.css';

interface IJupyterState {
  dirty?: boolean;
  failsApp?: JSONObject;
  kernelspec?: JSONObject;
}

interface IJupyterEditProps {
  stateCallback?: (state: IJupyterState) => void;
  receiveInterceptorUpdate?: (update: IInterceptorUpdate) => void;
  kernelStatusCallback?: (status: string) => void;
  appletSizeChanged?: (appid: string, width: number, height: number) => void;
  jupyterurl: string; // url of the jupyter lite distribution
  filename: string; // filename of the document
  document: JSONObject | undefined; // the document as javascript object
  appid?: string; // id of the applet or undefined if not in applet mode
  rerunAtStartup: boolean;
  installScreenShotPatches: boolean; // install patches to allow screenshots of plotly
  GDPRProxy?: IGDPRProxyInfo;
  editActivated?: boolean; // whether the jupyter edit is activated.
  pointerOff?: boolean; // if true, no pointer interaction with jupyter is possible
}

interface IJupyterEditState {
  appletSizes?:
    | {
        [key: string]: IFailsAppletSize;
      }
    | undefined;
  dirty: boolean;
  appLoading: boolean;
}

interface IDocumentMetadata extends PartialJSONObject {
  kernelspec?: JSONObject;
}

export class JupyterEdit extends Component<
  IJupyterEditProps,
  IJupyterEditState
> {
  constructor(props: IJupyterEditProps) {
    super(props);
    this.state = { dirty: false, appLoading: true };
    this.onMessage = this.onMessage.bind(this);
    if (props.stateCallback) {
      props.stateCallback({ dirty: false });
    }
  }

  componentDidMount() {
    if (!this.props.jupyterurl) {
      throw new Error('No jupyter url passed');
    }
    window.addEventListener('message', this.onMessage);
    if (this.props.receiveInterceptorUpdate) {
      this.activateInterceptor(true);
    }
  }

  componentDidUpdate(prevProps: IJupyterEditProps) {
    if (!this.props.jupyterurl) {
      throw new Error('No jupyter url passed');
    }
    if (this.props.appid !== prevProps.appid) {
      this.activateApp();
    }
    if (
      this.props.receiveInterceptorUpdate !== prevProps.receiveInterceptorUpdate
    ) {
      this.activateInterceptor(!!this.props.receiveInterceptorUpdate);
    }
  }

  componentWillUnmount() {
    window.removeEventListener('message', this.onMessage);
  }

  loadJupyter() {
    const data = this.props.document;
    const metadata = data?.metadata as IDocumentMetadata | null;
    if (metadata?.kernelspec) {
      const kernelspec = metadata?.kernelspec;
      if (kernelspec?.name !== 'python' && kernelspec?.name !== 'xpython') {
        // replace the kernel
        kernelspec.name = 'python';
        kernelspec.display_name = 'Python (Pyodide)';
        kernelspec.language = 'python';
        kernelspec.name = 'python';
      }
    }
    this.sendToIFrame({
      type: 'loadJupyter',
      inLecture: !!this.props.appid,
      rerunAtStartup: !!this.props.rerunAtStartup,
      installScreenShotPatches: !!this.props.installScreenShotPatches,
      installGDPRProxy: this.props.GDPRProxy,
      appid: this.props.appid,
      fileName: this.props.filename || 'example.ipynb',
      fileData: data,
      kernelName:
        ((data?.metadata as IDocumentMetadata)?.kernelspec?.name as
          | 'python'
          | 'xpython'
          | undefined) ?? 'python'
    });
  }

  async saveJupyter() {
    const fileToSaveObj = await this.sendToIFrameAndReceive({
      type: 'saveJupyter',
      fileName: this.props.filename || 'example.ipynb'
    });
    if (!fileToSaveObj.fileData) {
      throw new Error('Empty saveJupyter response');
    }
    return fileToSaveObj.fileData;
  }

  async screenShot({ dpi }: IScreenShotOpts) {
    const { screenshot } = await this.sendToIFrameAndReceive({
      type: 'screenshotApp',
      dpi
    });
    return screenshot;
  }

  activateApp() {
    const appid = this.props.appid;
    return this.sendToIFrameAndReceive({
      type: 'activateApp',
      inLecture: !!appid,
      appid
    });
  }

  async getLicenses() {
    return this.sendToIFrameAndReceive({
      type: 'getLicenses'
    });
  }

  async restartKernelAndRunCells() {
    return this.sendToIFrameAndReceive({
      type: 'restartKernelAndRerunCells'
    });
  }

  activateInterceptor(activate: boolean) {
    return this.sendToIFrameAndReceive({
      type: 'activateInterceptor',
      activate
    });
  }

  sendInterceptorUpdate({ path, mime, state }: IInterceptorUpdate) {
    return this.sendToIFrameAndReceive({
      type: 'receiveInterceptorUpdate',
      path,
      mime,
      state
    });
  }

  onMessage(event: MessageEvent) {
    if (event.source === window) {
      return;
    }
    if (event.source !== this._iframe?.contentWindow) {
      return;
    }
    if (event.origin !== new URL(this.props.jupyterurl).origin) {
      return;
    }
    const data = event.data as IJupyterToFailsMessage;
    if (event.data.requestId) {
      const requestId = event.data.requestId;
      if (this._requests.has(requestId)) {
        const request = this._requests.get(requestId);
        this._requests.delete(requestId);
        if (event.data.error) {
          request.reject(new Error(event.data.error));
          return;
        }
        request.resolve(event.data);
        return;
      }
    }
    switch (data?.task) {
      case 'appLoaded':
        this.setState({ appLoading: false });
        this.loadJupyter();
        break;
      case 'docDirty':
        {
          const { dirty = undefined } = data as IDocDirty;
          if (this.props.stateCallback && typeof dirty !== 'undefined') {
            this.props.stateCallback({ dirty });
          }
        }
        break;
      case 'reportMetadata':
        {
          const { failsApp = undefined, kernelspec = undefined } =
            data?.metadata ?? {};
          if (
            this.props.stateCallback &&
            (typeof failsApp !== 'undefined' ||
              typeof kernelspec !== 'undefined')
          ) {
            this.props.stateCallback({ failsApp, kernelspec });
          }
        }
        break;
      case 'reportFailsAppletSizes':
        {
          const { appletSizes = undefined } = data as IReportFailsAppletSizes;
          if (typeof appletSizes !== 'undefined') {
            this.setState(state => {
              const retState: {
                appletSizes?: {
                  [key: string]: IFailsAppletSize;
                };
              } = {};
              for (const appletSize of Object.values(appletSizes)) {
                const { appid, height, width } = appletSize;
                if (state?.appletSizes?.[appid]) {
                  const oldsize = state.appletSizes[appid];
                  if (oldsize.height === height && oldsize.width === width) {
                    continue;
                  }
                }
                if (!retState.appletSizes) {
                  retState.appletSizes = {};
                }
                retState.appletSizes[appid] = { width, height, appid };
                this.props?.appletSizeChanged?.(appid, width, height);
              }
              return retState;
            });
          }
        }
        break;
      case 'reportKernelStatus':
        this.props?.kernelStatusCallback?.(data.status);
        break;
      case 'sendInterceptorUpdate':
        {
          const { path, mime, state } = data;
          this.props?.receiveInterceptorUpdate?.({ path, mime, state });
        }
        break;
      default:
    }
  }

  sendToIFrame(message: IFailsToJupyterMessage) {
    if (this._iframe) {
      this._iframe.contentWindow?.postMessage(message, this.props.jupyterurl);
    }
  }

  async sendToIFrameAndReceive(message: IFailsToJupyterMessage): Promise<any> {
    const requestId = this._requestId++;
    return new Promise((resolve, reject) => {
      this._requests.set(requestId, {
        requestId,
        resolve,
        reject
      });
      this.sendToIFrame({
        // @ts-expect-error requestId is not included in type
        requestId,
        ...message
      });
    });
  }

  render() {
    // launch debugging in the following way:
    // jupyter lab --allow-root --ServerApp.allow_origin='*' --ServerApp.tornado_settings="{'headers': {'Content-Security-Policy': 'frame-ancestors self *'}}" --ServerApp.allow_websocket_origin='*' --ServerApp.cookie_options="{'samesite': 'None', 'secure': True}"
    // jupyter lab --allow-root --ServerApp.allow_origin='*' --ServerApp.tornado_settings="{'headers': {'Content-Security-Policy': 'frame-ancestors self *'}}" --ServerApp.allow_websocket_origin='*' --ServerApp.cookie_options="{'samesite': 'None', 'secure': True}" --LabServerApp.app_settings_dir=/workspaces/jupyterfails/development/config/app-edit
    // do it only in a container!

    if (!this.props.editActivated) {
      return <Fragment>JupyterEdit is not activated</Fragment>;
    }
    let width = '100%';
    let height = '99%';

    if (this.props.appid) {
      const appletSize =
        this.state.appletSizes && this.state.appletSizes[this.props.appid];
      if (appletSize) {
        width = Math.ceil(appletSize.width * 1.01) + 'px';
        height = Math.ceil(appletSize.height * 1.01) + 'px';
      }
    }
    let className = 'jpt-edit-iframe';
    if (this.props.pointerOff) {
      className += ' jpyt-edit-iframe-pointeroff';
    }

    return (
      <Fragment>
        <iframe
          style={{ width, height }}
          className={className}
          src={this.props.jupyterurl}
          ref={el => {
            this._iframe = el;
          }}
          onLoad={() => {
            console.log('Jupyter iframe loaded');
          }}
          allow=""
          // @ts-expect-error credentialless
          credentialless="true"
          sandbox="allow-scripts allow-downloads allow-same-origin allow-popups" // we need allow-forms for a local jupyter server, remove for jupyterlite
          title="jupyteredit"
        ></iframe>
        {this.state.appLoading && (
          <h2
            style={{
              position: 'absolute',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)'
            }}
          >
            Jupyter is loading, be patient...
          </h2>
        )}
      </Fragment>
    );
  }

  private _iframe: HTMLIFrameElement | null = null;
  private _requestId: number = 1; // id, if we request something
  private _requests = new Map();
}
