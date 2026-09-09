<#
.SYNOPSIS
  VoxShieldAI — One-Command Demo Launcher
  Starts all services, runs preflight diagnostics, and opens the frontend.

.DESCRIPTION
  1. Starts Python ML service (uvicorn) from backend/ml_service
  2. Polls /internal/ready until models are loaded (timeout 60s)
  3. Starts Express backend (npm start) from backend/
  4. Waits for /api/health to respond
  5. Runs demo preflight diagnostics
  6. Starts Vite frontend (npm run dev) and opens browser
  7. Ctrl+C gracefully stops all processes
#>

$ErrorActionPreference = "Stop"
$Host.UI.RawUI.WindowTitle = "VoxShieldAI Launcher"

# ─── Colors ──────────────────────────────────────────────────────────────────
function Write-Status($icon, $msg, $color = "Cyan") {
    Write-Host "  $icon " -NoNewline -ForegroundColor $color
    Write-Host $msg
}
function Write-Header($msg) {
    Write-Host ""
    Write-Host "  ══════════════════════════════════════════════════════" -ForegroundColor DarkCyan
    Write-Host "   $msg" -ForegroundColor White
    Write-Host "  ══════════════════════════════════════════════════════" -ForegroundColor DarkCyan
    Write-Host ""
}

# ─── Paths ───────────────────────────────────────────────────────────────────
$projectRoot = $PSScriptRoot
$backendDir  = Join-Path $projectRoot "backend"
$mlDir       = Join-Path $backendDir  "ml_service"
$frontendDir = Join-Path $projectRoot "frontend"

# ─── Process Tracking ────────────────────────────────────────────────────────
$script:procs = @()

function Stop-AllServices {
    Write-Host ""
    Write-Header "Shutting Down VoxShieldAI"
    foreach ($p in $script:procs) {
        if ($p -and !$p.HasExited) {
            Write-Status "⏹" "Stopping PID $($p.Id) ($($p.ProcessName))..." "Yellow"
            try { Stop-Process -Id $p.Id -Force -ErrorAction SilentlyContinue } catch {}
        }
    }
    Write-Status "✓" "All services stopped." "Green"
}

# Register Ctrl+C handler
$null = Register-EngineEvent -SourceIdentifier PowerShell.Exiting -Action { Stop-AllServices }
trap { Stop-AllServices; break }

# ─── Banner ──────────────────────────────────────────────────────────────────
Clear-Host
Write-Host ""
Write-Host "   ╔═══════════════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "   ║          VoxShieldAI — Demo Launcher v1.0            ║" -ForegroundColor Cyan
Write-Host "   ║   Multi-Signal Voice Threat Intelligence Platform    ║" -ForegroundColor DarkCyan
Write-Host "   ╚═══════════════════════════════════════════════════════╝" -ForegroundColor Cyan
Write-Host ""

# ═══════════════════════════════════════════════════════════════════════════════
# STEP 1: Start Python ML Service
# ═══════════════════════════════════════════════════════════════════════════════
Write-Header "Step 1/5: Starting Python ML Service"

$venvPython = Join-Path $mlDir ".venv\Scripts\python.exe"
$venvUvicorn = Join-Path $mlDir ".venv\Scripts\uvicorn.exe"

if (!(Test-Path $venvUvicorn)) {
    Write-Status "⚠" "ML venv not found at $venvUvicorn — skipping ML service." "Yellow"
    Write-Status "!" "ECAPA-TDNN and faster-whisper will be unavailable." "Yellow"
    $mlRunning = $false
} else {
    $mlProc = Start-Process -FilePath $venvUvicorn `
        -ArgumentList "app:app","--host","127.0.0.1","--port","8001" `
        -WorkingDirectory $mlDir `
        -PassThru -NoNewWindow -RedirectStandardOutput (Join-Path $projectRoot "ml_service.log") `
        -RedirectStandardError (Join-Path $projectRoot "ml_service_err.log")
    $script:procs += $mlProc
    Write-Status "🚀" "ML service started (PID $($mlProc.Id))" "Green"

    # Poll /internal/ready
    $mlRunning = $false
    $timeout = 60
    $elapsed = 0
    Write-Status "⏳" "Waiting for models to load (timeout ${timeout}s)..."
    while ($elapsed -lt $timeout) {
        Start-Sleep -Seconds 2
        $elapsed += 2
        try {
            $resp = Invoke-RestMethod -Uri "http://127.0.0.1:8001/internal/ready" -TimeoutSec 3 -ErrorAction Stop
            if ($resp.ready -eq $true) {
                $mlRunning = $true
                Write-Status "✓" "ML service ready — SpeechBrain + faster-whisper loaded (${elapsed}s)" "Green"
                break
            }
        } catch {
            # still loading
        }
        Write-Host "." -NoNewline -ForegroundColor DarkGray
    }
    if (-not $mlRunning) {
        Write-Status "⚠" "ML service did not become ready within ${timeout}s. Continuing without local models." "Yellow"
    }
}

# ═══════════════════════════════════════════════════════════════════════════════
# STEP 2: Start Express Backend
# ═══════════════════════════════════════════════════════════════════════════════
Write-Header "Step 2/5: Starting Express Backend"

$expressProc = Start-Process -FilePath "node" `
    -ArgumentList "src/server.js" `
    -WorkingDirectory $backendDir `
    -PassThru -NoNewWindow -RedirectStandardOutput (Join-Path $projectRoot "express.log") `
    -RedirectStandardError (Join-Path $projectRoot "express_err.log")
$script:procs += $expressProc
Write-Status "🚀" "Express backend started (PID $($expressProc.Id))" "Green"

# Poll /api/health
$expressReady = $false
$timeout = 15
$elapsed = 0
Write-Status "⏳" "Waiting for Express to respond (timeout ${timeout}s)..."
while ($elapsed -lt $timeout) {
    Start-Sleep -Seconds 1
    $elapsed += 1
    try {
        $resp = Invoke-RestMethod -Uri "http://localhost:5000/api/health" -TimeoutSec 2 -ErrorAction Stop
        if ($resp.status -eq "ok") {
            $expressReady = $true
            Write-Status "✓" "Express backend ready (${elapsed}s)" "Green"
            break
        }
    } catch {}
    Write-Host "." -NoNewline -ForegroundColor DarkGray
}
if (-not $expressReady) {
    Write-Status "✗" "Express backend did not respond. Check express_err.log" "Red"
}

# ═══════════════════════════════════════════════════════════════════════════════
# STEP 3: Run Preflight Diagnostics
# ═══════════════════════════════════════════════════════════════════════════════
Write-Header "Step 3/5: Running Preflight Diagnostics"

if ($expressReady) {
    try {
        $preflightResult = & node (Join-Path $backendDir "scripts\preflight.js") 2>&1
        $preflightResult | ForEach-Object { Write-Host "    $_" }
    } catch {
        Write-Status "⚠" "Preflight script failed: $_" "Yellow"
    }
} else {
    Write-Status "⚠" "Skipping preflight — Express is not ready." "Yellow"
}

# ═══════════════════════════════════════════════════════════════════════════════
# STEP 4: Check Provider Status
# ═══════════════════════════════════════════════════════════════════════════════
Write-Header "Step 4/5: Provider Status Summary"

if ($expressReady) {
    try {
        $providers = Invoke-RestMethod -Uri "http://localhost:5000/api/system/providers" -TimeoutSec 5 -ErrorAction Stop
        
        $rdStatus = if ($providers.reality_defender.available) { "✓ ONLINE" } elseif ($providers.reality_defender.configured) { "⚠ DEGRADED" } else { "✗ NOT CONFIGURED" }
        $sttStatus = if ($providers.speech_recognition) { "✓ ONLINE" } else { "✗ OFFLINE" }
        $spkStatus = if ($providers.speaker_verification.available -or $providers.speaker_engine.available) { "✓ ONLINE" } else { "✗ OFFLINE" }
        $dbStatus = if ($providers.database.available) { "✓ ONLINE" } else { "✗ OFFLINE" }

        Write-Status "🔬" "Reality Defender:    $rdStatus"
        Write-Status "🗣" "Speech Recognition: $sttStatus"
        Write-Status "👤" "Speaker Engine:     $spkStatus"
        Write-Status "🗄" "Database:           $dbStatus"
    } catch {
        Write-Status "⚠" "Could not fetch provider status." "Yellow"
    }
} else {
    Write-Status "⚠" "Skipping — Express is not ready." "Yellow"
}

# ═══════════════════════════════════════════════════════════════════════════════
# STEP 5: Start Frontend
# ═══════════════════════════════════════════════════════════════════════════════
Write-Header "Step 5/5: Starting Vite Frontend"

$frontendProc = Start-Process -FilePath "npm" `
    -ArgumentList "run","dev" `
    -WorkingDirectory $frontendDir `
    -PassThru -NoNewWindow -RedirectStandardOutput (Join-Path $projectRoot "frontend.log") `
    -RedirectStandardError (Join-Path $projectRoot "frontend_err.log")
$script:procs += $frontendProc
Write-Status "🚀" "Frontend dev server started (PID $($frontendProc.Id))" "Green"

Start-Sleep -Seconds 3
Write-Status "🌐" "Opening http://localhost:5173" "Cyan"
Start-Process "http://localhost:5173"

# ═══════════════════════════════════════════════════════════════════════════════
# Hold open — Ctrl+C to stop
# ═══════════════════════════════════════════════════════════════════════════════
Write-Host ""
Write-Host "  ╔═══════════════════════════════════════════════════════╗" -ForegroundColor Green
Write-Host "  ║       VoxShieldAI is RUNNING — Press Ctrl+C to stop  ║" -ForegroundColor Green
Write-Host "  ╚═══════════════════════════════════════════════════════╝" -ForegroundColor Green
Write-Host ""

try {
    while ($true) {
        Start-Sleep -Seconds 5
        # Check if any critical process died
        foreach ($p in $script:procs) {
            if ($p -and $p.HasExited) {
                Write-Status "⚠" "Process PID $($p.Id) exited with code $($p.ExitCode)." "Yellow"
            }
        }
    }
} finally {
    Stop-AllServices
}
