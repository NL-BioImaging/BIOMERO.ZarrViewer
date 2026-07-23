[CmdletBinding()]
param(
    [Parameter(Mandatory, Position = 0)]
    [ValidateSet("install", "update", "remove", "status")]
    [string] $Action,
    [string] $Container,
    [switch] $SkipBuild,
    [switch] $SkipFrontend,
    [switch] $NoRestart
)

$ErrorActionPreference = "Stop"
$RepoRoot = Split-Path -Parent $PSScriptRoot
$ContainerPython = "/opt/omero/web/venv3/bin/python"
$ContainerOmero = "/opt/omero/web/venv3/bin/omero"
$ContainerConfig = "/opt/omero/web/config/90-biomero-zarr-viewer.omero"
$ContainerStatic = "/opt/omero/web/OMERO.web/var/static/biomero_zarr_viewer"
$PackageName = "biomero-zarr-viewer"

function Invoke-Docker {
    param([Parameter(Mandatory)][string[]] $DockerArguments, [switch] $AllowFailure)
    & docker @DockerArguments
    $exitCode = $LASTEXITCODE
    if (-not $AllowFailure -and $exitCode -ne 0) {
        throw "docker $($DockerArguments -join ' ') failed with exit code $exitCode"
    }
    return $exitCode
}

function Resolve-WebContainer {
    if ($Container) {
        $running = docker inspect --format "{{.State.Running}}" $Container 2>$null
        if ($LASTEXITCODE -ne 0 -or $running -ne "true") { throw "OMERO.web container '$Container' is not running." }
        return $Container
    }
    $matches = @(docker ps --filter "label=com.docker.compose.service=omeroweb" --format "{{.Names}}") | Where-Object { $_ }
    if ($matches.Count -eq 0) { throw "No running Docker Compose service named 'omeroweb' was found. Use -Container." }
    if ($matches.Count -gt 1) { throw "Multiple OMERO.web containers were found. Use -Container." }
    return ($matches | Select-Object -First 1)
}

function Get-HostPython {
    $venvPython = Join-Path $RepoRoot ".venv\Scripts\python.exe"
    if (Test-Path $venvPython) { return $venvPython }
    $python = Get-Command python -ErrorAction SilentlyContinue
    if (-not $python) { throw "Python was not found." }
    return $python.Source
}

function Build-Wheel {
    $python = Get-HostPython
    if (-not $SkipBuild) {
        Push-Location $RepoRoot
        try {
            if (-not $SkipFrontend) { & $python scripts/build_frontend.py --skip-install }
            else { & $python scripts/build_frontend.py --validate-only }
            if ($LASTEXITCODE -ne 0) { throw "Frontend build or validation failed." }
            $buildDirectory = Join-Path $RepoRoot "build"
            if (Test-Path $buildDirectory) { Remove-Item -LiteralPath $buildDirectory -Recurse -Force }
            & $python -m build --wheel --no-isolation
            if ($LASTEXITCODE -ne 0) { throw "Wheel build failed." }
        } finally { Pop-Location }
    }
    $wheel = Get-ChildItem (Join-Path $RepoRoot "dist\biomero_zarr_viewer-*.whl") | Sort-Object LastWriteTime -Descending | Select-Object -First 1
    if (-not $wheel) { throw "No viewer wheel exists in dist." }
    return $wheel
}

function Restart-WebContainer {
    param([bool] $ExpectApp)
    if ($NoRestart) { Write-Warning "Restart deferred; changes are not active yet."; return }
    Invoke-Docker -DockerArguments @("restart", $Container) | Out-Null
    $deadline = (Get-Date).AddSeconds(90)
    do {
        Start-Sleep -Seconds 2
        & docker exec $Container $ContainerOmero web status *> $null
        if ($LASTEXITCODE -eq 0) {
            $apps = & docker exec $Container $ContainerOmero config get omero.web.apps 2>$null
            $appActive = $LASTEXITCODE -eq 0 -and $apps -match 'biomero_zarr_viewer'
            if ($appActive -eq $ExpectApp) {
                Write-Host "OMERO.web is running."
                return
            }
        }
    } while ((Get-Date) -lt $deadline)
    throw "OMERO.web did not reach the expected plugin state within 90 seconds."
}

function Show-Status {
    Write-Host "Container: $Container"
    $version = & docker exec $Container $ContainerPython -c "import importlib.metadata as m; print(m.version('$PackageName'))" 2>$null
    Write-Host $(if ($LASTEXITCODE -eq 0) { "Package: installed ($version)" } else { "Package: not installed" })
    $apps = & docker exec $Container $ContainerOmero config get omero.web.apps 2>$null
    Write-Host $(if ($apps -match 'biomero_zarr_viewer') { "OMERO.web: app active" } else { "OMERO.web: app inactive" })
    $mount = & docker exec $Container $ContainerOmero config get omero.web.zarr_viewer.mount_root 2>$null
    if ($LASTEXITCODE -eq 0) {
        Write-Host "Zarr mount: $mount"
        & docker exec $Container test -r $mount
        if ($LASTEXITCODE -ne 0) { Write-Warning "The configured Zarr mount is not readable in OMERO.web." }
    }
    Write-Host "Nginx: verify the internal Zarr location in the existing serving Nginx (host or container)."
}

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) { throw "Docker CLI was not found." }
$Container = Resolve-WebContainer

switch ($Action) {
    "status" { Show-Status }
    { $_ -in @("install", "update") } {
        $wheel = Build-Wheel
        $remoteWheel = "/tmp/$($wheel.Name)"
        $configSource = Join-Path $RepoRoot "docker\90-biomero-zarr-viewer.omero"
        Invoke-Docker -DockerArguments @("cp", $wheel.FullName, "${Container}:$remoteWheel") | Out-Null
        try {
            Invoke-Docker -DockerArguments @("exec", "--user", "root", $Container, $ContainerPython, "-m", "pip", "install", "--no-deps", "--force-reinstall", $remoteWheel) | Out-Null
            Invoke-Docker -DockerArguments @("cp", $configSource, "${Container}:$ContainerConfig") | Out-Null
            Invoke-Docker -DockerArguments @("exec", "--user", "root", $Container, "chmod", "0644", $ContainerConfig) | Out-Null
            Invoke-Docker -DockerArguments @("exec", "--user", "root", $Container, "rm", "-rf", $ContainerStatic) | Out-Null
        } finally {
            Invoke-Docker -DockerArguments @("exec", "--user", "root", $Container, "rm", "-f", $remoteWheel) -AllowFailure | Out-Null
        }
        Restart-WebContainer -ExpectApp $true
        Show-Status
    }
    "remove" {
        Invoke-Docker -DockerArguments @("exec", "--user", "root", $Container, "rm", "-f", $ContainerConfig) | Out-Null
        Invoke-Docker -DockerArguments @("exec", "--user", "root", $Container, $ContainerPython, "-m", "pip", "uninstall", "-y", $PackageName) | Out-Null
        Invoke-Docker -DockerArguments @("exec", "--user", "root", $Container, "rm", "-rf", $ContainerStatic) | Out-Null
        Restart-WebContainer -ExpectApp $false
        Show-Status
    }
}
