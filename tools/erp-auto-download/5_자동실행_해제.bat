@echo off
chcp 65001 >nul
schtasks /delete /tn "ERP_Auto_Download" /f
pause
