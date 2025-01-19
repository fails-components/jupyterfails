#! /bin/bash
conda activate failscomponents
cd packages

for dir in ./*/; do
    if [ -d "$dir" ]; then
        cd "$dir"
        echo Pip install in $dir
        pip install -ve .
         echo Labextension install in $dir
        jupyter labextension develop --overwrite .
        cd ..
    fi
done
cd ..
