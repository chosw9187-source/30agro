@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo Edge and a recorder window will open. Log in and click through to the Excel download as usual.
echo Then copy the code shown in the recorder window.
python -m playwright codegen --channel msedge http://www.sgerp.com/
pause
