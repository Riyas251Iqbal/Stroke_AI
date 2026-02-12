@echo off
echo Starting Stroke AI Backend...
echo.

REM Check if venv exists
if not exist "venv" (
    echo Virtual environment not found!
    echo Creating virtual environment...
    python -m venv venv
    echo Installing dependencies...
    venv\Scripts\pip install -r requirements.txt
)

REM Use the virtual environment python
echo Activating virtual environment...
venv\Scripts\python.exe app.py

pause
