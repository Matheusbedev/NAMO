@echo off
cd /d "%~dp0"
echo === Anato da Mari: preparando o atlas ===
node tools\translate_bp3d.mjs
if errorlevel 1 goto erro

echo.
echo === Importando atlas Z-Anatomy (10 sistemas) ===
node tools\build_zanatomy.mjs
if errorlevel 1 goto erro

echo.
echo === Validando os modelos ===
call npm.cmd run check
if errorlevel 1 goto erro

echo.
echo === Validando o site ===
call npm.cmd run build
if errorlevel 1 goto erro

echo.
echo === Abrindo o atlas ===
start "" "http://localhost:5173/#/anatomia"
call npm.cmd run dev
goto fim

:erro
echo.
echo ERRO: copie a mensagem acima e envie para correcao.
:fim
pause
