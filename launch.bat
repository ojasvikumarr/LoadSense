@echo off
setlocal enabledelayedexpansion

echo [%time:~0,8%] Setting up environment

REM Setup environment files
if not exist ".\load_balancer\.env" (
  (
    echo PORT=3000
    echo ML_SERVICE_URL=http://localhost:5000
    echo BACKEND_SERVER_1=http://localhost:3001
    echo BACKEND_SERVER_2=http://localhost:3002
  ) > .\load_balancer\.env
)

if not exist ".\traffic_simulator\.env" (
  (
    echo LOAD_BALANCER_URL=http://localhost:3000
    echo MIN_REQUESTS_PER_MINUTE=5
    echo MAX_REQUESTS_PER_MINUTE=50
    echo SIMULATION_DURATION_MINUTES=60
  ) > .\traffic_simulator\.env
)

echo [%time:~0,8%] Creating directories
if not exist ".\load_balancer\logs" mkdir .\load_balancer\logs
if not exist ".\ml_module\logs" mkdir .\ml_module\logs
if not exist ".\traffic_simulator\logs" mkdir .\traffic_simulator\logs

echo [%time:~0,8%] Installing dependencies

echo [%time:~0,8%] Load balancer
cd .\load_balancer && npm install --no-fund --no-audit
cd ..

echo [%time:~0,8%] Backend servers
cd .\backend_servers && npm install --no-fund --no-audit
cd ..

echo [%time:~0,8%] Traffic simulator
cd .\traffic_simulator && npm install --no-fund --no-audit
cd ..

echo [%time:~0,8%] ML module
cd .\ml_module && pip install -r requirements.txt
cd ..

echo [%time:~0,8%] Starting services

echo [%time:~0,8%] ML service
start cmd /k "cd %CD%\ml_module && python app.py"
timeout /t 3 > nul

echo [%time:~0,8%] Backend servers
start cmd /k "cd %CD%\backend_servers && node server_manager.js"
timeout /t 2 > nul

echo [%time:~0,8%] Load balancer
start cmd /k "cd %CD%\load_balancer && node server.js"
timeout /t 2 > nul

echo [%time:~0,8%] All services running

echo.
echo [%time:~0,8%] Traffic simulator usage:
echo   cd .\traffic_simulator ^&^& node simulator.js
echo   node simulator.js --pattern sine_wave --duration 30
echo.
echo [%time:~0,8%] System is ready
