# Fails Jupyter Lite distirbution

[![Github Actions Status](https://github.com/fails-components/jupyterfails/workflows/Build/badge.svg)](https://github.com/fails-components/jupyterfails/actions/workflows/build.yml)

This are files for building a Jupyter lite distribution to be used within fails-components.
It also includes a couple of extensions for the communication with fails and also for controlling applets.



## Contributing

### Development install

Use the development container.

The `jlpm` command is JupyterLab's pinned version of
[yarn](https://yarnpkg.com/) that is installed with JupyterLab. You may use
`yarn` or `npm` in lieu of `jlpm` below.

Run the following commands in each of the packages.

```bash
# Clone the repo to your local environment
# Change directory to the fails_components_jupyter_applet_view directory
# Install package in development mode
pip install -e "."
# Link your development version of the extension with JupyterLab
jupyter labextension develop . --overwrite
# Rebuild extension Typescript source after making changes
jlpm build
```

To run jupyter lite just execute:

```bash
jlpm build
jupyter lite build
jupyter lite serve
```
### Packaging the extension

See [RELEASE](RELEASE.md)
