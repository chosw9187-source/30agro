@echo off
chcp 949 >nul
setlocal enabledelayedexpansion
title 본부 AI 워크플로우

set "APP=%~dp0AI_Workflow.html"
if not exist "%APP%" (
  echo.
  echo   AI_Workflow.html 파일을 찾지 못했습니다.
  echo   zip 압축을 먼저 푼 뒤, 이 실행 파일과 같은 폴더에서 다시 실행해 주세요.
  echo.
  pause
  exit /b
)

rem 파일 경로를 브라우저 주소(file:///...)로 바꾼다. 공백은 %%20으로 바꾼다.
set "URL=!APP:\=/!"
set "URL=file:///!URL: =%%20!"

set "BROWSER="
for %%P in (
  "%ProgramFiles%\Google\Chrome\Application\chrome.exe"
  "%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe"
  "%LocalAppData%\Google\Chrome\Application\chrome.exe"
  "%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe"
  "%ProgramFiles%\Microsoft\Edge\Application\msedge.exe"
) do (
  if not defined BROWSER if exist %%P set "BROWSER=%%~P"
)

if defined BROWSER (
  start "" "!BROWSER!" --app="!URL!" --window-size=1480,980
) else (
  start "" "%APP%"
)
endlocal
