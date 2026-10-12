@echo off
chcp 65001 >nul
title Мини-CRM — Запуск...

echo ═══════════════════════════════════════════════════════════════
echo                    МИНИ-CRM — АВТОЗАПУСК
echo ═══════════════════════════════════════════════════════════════
echo.

REM Проверяем наличие файла программы
if not exist "dist\index.html" (
    echo ❌ ОШИБКА: Файл dist\index.html не найден!
    echo.
    echo Возможно, проект не был собран.
    echo Выполните команду: npm run build
    echo.
    pause
    exit /b 1
)

echo ✅ Файл программы найден: dist\index.html
echo.

REM Ищем Chrome
set "CHROME_PATH="
if exist "%ProgramFiles%\Google\Chrome\Application\chrome.exe" (
    set "CHROME_PATH=%ProgramFiles%\Google\Chrome\Application\chrome.exe"
)
if exist "%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe" (
    set "CHROME_PATH=%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe"
)
if exist "%LocalAppData%\Google\Chrome\Application\chrome.exe" (
    set "CHROME_PATH=%LocalAppData%\Google\Chrome\Application\chrome.exe"
)

REM Ищем Edge
set "EDGE_PATH="
if exist "%ProgramFiles%\Microsoft\Edge\Application\msedge.exe" (
    set "EDGE_PATH=%ProgramFiles%\Microsoft\Edge\Application\msedge.exe"
)
if exist "%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe" (
    set "EDGE_PATH=%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe"
)

REM Открываем в Chrome (приоритет)
if defined CHROME_PATH (
    echo 🌐 Запускаю в Google Chrome...
    echo.
    start "" "%CHROME_PATH%" "%~dp0dist\index.html"
    echo ✅ Программа запущена!
    echo.
    echo 💡 Подсказка:
    echo    • Нажмите "📄 Создать базу" для создания файла базы данных
    echo    • Все данные автоматически сохраняются в CSV
    echo    • CSV можно открыть в Excel
    echo.
    timeout /t 5 >nul
    exit /b 0
)

REM Открываем в Edge (если Chrome не найден)
if defined EDGE_PATH (
    echo 🌐 Запускаю в Microsoft Edge...
    echo.
    start "" "%EDGE_PATH%" "%~dp0dist\index.html"
    echo ✅ Программа запущена!
    echo.
    echo 💡 Подсказка:
    echo    • Нажмите "📄 Создать базу" для создания файла базы данных
    echo    • Все данные автоматически сохраняются в CSV
    echo    • CSV можно открыть в Excel
    echo.
    timeout /t 5 >nul
    exit /b 0
)

REM Если ни Chrome, ни Edge не найдены
echo ❌ ОШИБКА: Не найден Google Chrome или Microsoft Edge!
echo.
echo Для работы программы необходим один из этих браузеров:
echo.
echo   🌐 Google Chrome:  https://www.google.com/chrome/
echo   🌐 Microsoft Edge: https://www.microsoft.com/edge
echo.
echo После установки браузера запустите этот файл снова.
echo.
pause
exit /b 1
