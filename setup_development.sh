#! /bin/bash
conda activate failscomponents
jlpm install
jlpm build
cd packages

for dir in ./*/; do
    if [ -d "$dir" ] && [ "$(basename "$dir")" != "jupyterreactedit" ]; then
        cd "$dir"
        echo Pip install in $dir
        pip install -ve .
         echo Labextension install in $dir
        jupyter labextension develop --overwrite .
        cd ..
    fi
done
cd ..
