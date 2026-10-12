@echo off
chcp 65001 >nul
echo.
echo ========================================
echo   Мини-CRM - Запуск программы
echo ========================================
echo.
echo Открываю программу в браузере...
echo.

REM Проверяем наличие Chrome
if exist "C:\Program Files\Google\Chrome\Application\chrome.exe" (
    start "" "C:\Program Files\Google\Chrome\Application\chrome.exe" "%~dp0dist\index.html"
    echo Программа открыта в Google Chrome
    goto :end
)

if exist "C:\Program Files (x86)\Google\Chrome\Application\chrome.exe" (
    start "" "C:\Program Files (x86)\Google\Chrome\Application\chrome.exe" "%~dp0dist\index.html"
    echo Программа открыта в Google Chrome
    goto :end
)

REM Проверяем наличие Edge
if exist "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe" (
    start "" "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe" "%~dp0dist\index.html"
    echo Программа открыта в Microsoft Edge
    goto :end
)

if exist "C:\Program Files\Microsoft\Edge\Application\msedge.exe" (
    start "" "C:\Program Files\Microsoft\Edge\Application\msedge.exe" "%~dp0dist\index.html"
    echo Программа открыта в Microsoft Edge
    goto :end
)

REM Если ни Chrome, ни Edge не найдены - открываем в браузере по умолчанию
echo Не найден Chrome или Edge. Открываю в браузере по умолчанию...
start "" "%~dp0dist\index.html"

:end
echo.
echo ========================================
echo ВАЖНО: После открытия программы
echo ========================================
echo 1. Нажмите кнопку "Создать базу" в шапке
echo 2. Выберите место для файла базы данных
echo 3. Работайте! Данные сохраняются автоматически
echo.
echo Если программа не работает:
echo - Установите Google Chrome или Microsoft Edge
echo - Скачайте с: https://www.google.com/chrome/
echo.
pause
