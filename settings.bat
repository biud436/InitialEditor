@echo off
npm intall -y
npm install -D webpack webpack-cli
REM npm install --save-dev @babel/core @babel/cli
REM npm install --save-dev @babel/preset-env
REM npm install --save-dev @babel/polyfill
npm install --save-dev style-loader css-loader
npm install --save-dev file-loader
powershell wget "https://github.com/biud436/InitialEditor/raw/master/webpack.config.js" -OutFile "webpack.config.js"
pause