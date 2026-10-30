@echo off
rem Платформенная проверка SQLite store на Windows x64.
rem Запускает встроенный Node.js; Node.js, Yarn и сеть не нужны.
setlocal EnableExtensions EnableDelayedExpansion
chcp 65001 >nul
cd /d "%~dp0"

set "NODE=runtime\win-x64\node.exe"
set "EXPECTED="
for /f "usebackq tokens=1,2" %%A in ("runtime\SHA256SUMS") do (
  if /i "%%B"=="runtime/win-x64/node.exe" set "EXPECTED=%%A"
)
if not defined EXPECTED (
  echo FAIL: нет контрольной суммы runtime.
  goto :fail
)
if not exist "%NODE%" (
  echo FAIL: нет файла runtime.
  goto :fail
)

rem certutil печатает хеш отдельной строкой без двоеточия; старые версии разделяют байты пробелами.
set "ACTUAL="
for /f "usebackq delims=" %%H in (`certutil -hashfile "%NODE%" SHA256 ^| findstr /v ":"`) do (
  if not defined ACTUAL set "ACTUAL=%%H"
)
set "ACTUAL=!ACTUAL: =!"
if /i not "!ACTUAL!"=="%EXPECTED%" (
  echo FAIL: контрольная сумма runtime не совпадает.
  goto :fail
)

"%NODE%" "app\packages\persistence\platform-check\check.mjs" --report-dir "%~dp0."
if errorlevel 1 goto :fail

echo.
echo Готово. Пришлите файл report-win32-x64.json из каталога набора:
echo   %~dp0
pause
exit /b 0

:fail
echo.
echo Есть ошибки. Пришлите report-win32-x64.json (если создан) и этот вывод.
pause
exit /b 1
