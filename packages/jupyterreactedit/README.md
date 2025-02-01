!["FAILS logo"](https://github.com/fails-components/jupyterfails/failslogo.svg)

# Fancy automated internet lecture system (**FAILS**) - components (jupyter react edit)

(c) 2024 Marten Richter

The package provides a React component to include jupyter within FAILS, but may be usuable outside of fails.

This package is part of FAILS.
A web-based lecture system developed out of university lectures.

While FAILS as a whole is licensed via GNU Affero GPL version 3.0, this package is licensed under a BSD-style license that can be found in the LICENSE file.
This package is licensed more permissive since it can be useful outside of the FAILS environment, esspecially if you want to integrate Jupyter Lite into your application.
So the default license from Jupyter is used to be license compatible.

## Installation and usage

### Installation

You can install the package directly via npm from node.js:

For installation simply run:

```
npm install @fails-components/jupyter-react-edit
```

### Usage

You can integrate the React component via

```
import { JupyterEdit } from '@fails-components/jupyter-react-edit'

...

<JupyterEdit
  editActivated={/* true or false, to control activation */}
  jupyterurl={window.location.origin + '/jupyter/index.html' /* provides the URL of your jupyter lite deployment */}
  pointerOff={
   /* turn off and on mouse pointer inter actzion*/
  }
  rerunAtStartup={/* if true rerun all cells at startup*/}
  installScreenShotPatches={
    /* if true patches are installed within jupyter to allow for screenshots of applets*/
  }
  ref={/* you may want to track the reference to interact with the control*/}
  document={/* initial javascript object representing the jupyter file */}
  filename={/* file name */}
  appid={/* you can set an id to show only a specific applet, instead of full editing */}
  stateCallback={/* call back to process changes of the state of the jupyter applets */}
  appletSizeChanged={(appid, width, height) => {
    /* callback invoked if the size of an applet changes */
  }}
  kernelStatusCallback={status => {
    /* callback, if the kernel status changed */
  }}
  receiveInterceptorUpdate={({ path, mime, state }) => {
   /* information from the interceptor about a state update */
  }}
/>;

```

For more information please look at the usuage of the componenent inside fails, notably inside `@fails-components\app` and `@fails-components\lectureapp`.
