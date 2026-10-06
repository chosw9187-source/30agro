@echo off
chcp 65001 >nul
cd /d "%~dp0"
where python >nul 2>nul || (echo [ERROR] Python not found. Install from https://www.python.org/downloads/ with "Add python.exe to PATH" checked. & pause & exit /b 1)
python -m pip install --upgrade pip
python -m pip install -r requirements.txt || (echo [ERROR] install failed & pause & exit /b 1)
echo.
echo [OK] Install complete. Next: 1_계정등록.bat
pause
