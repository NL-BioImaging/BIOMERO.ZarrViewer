[CmdletBinding()]
param(
    [string] $Container,
    [string] $BaseImage,
    [string] $Tag,
    [switch] $SkipBuild,
    [switch] $SkipFrontend
)

$ErrorActionPreference = "Stop"
$RepoRoot = Split-Path -Parent $PSScriptRoot

function Resolve-WebContainer {
    if ($Container) {
        $running = docker inspect --format "{{.State.Running}}" $Container 2>$null
        if ($LASTEXITCODE -ne 0 -or $running -ne "true") {
            throw "OMERO.web container '$Container' does not exist or is not running."
        }
        return $Container
    }

    $matches = @(docker ps --filter "label=com.docker.compose.service=omeroweb" --format "{{.Names}}") |
        Where-Object { $_ }
    if ($matches.Count -ne 1) {
        throw "Expected one running Compose service named 'omeroweb'; found $($matches.Count). Use -Container."
    }
    return ($matches | Select-Object -First 1)
}

function Get-HostPython {
    $venvPython = Join-Path $RepoRoot ".venv\Scripts\python.exe"
    if (Test-Path $venvPython) { return $venvPython }
    $python = Get-Command python -ErrorAction SilentlyContinue
    if (-not $python) { throw "Python was not found." }
    return $python.Source
}

function Get-ContainerPluginConfigs {
    param([string] $Name)
    $command = 'for f in /opt/omero/web/config/*.omero; do [ -e "$f" ] && basename "$f"; done'
    return @(& docker exec $Name sh -c $command 2>$null) | Where-Object { $_ }
}

function Get-ImagePluginConfigs {
    param([string] $Image)
    $command = 'for f in /opt/omero/web/config/*.omero; do [ -e "$f" ] && basename "$f"; done'
    & docker image inspect $Image *> $null
    if ($LASTEXITCODE -ne 0) { throw "Base image '$Image' was not found." }
    return @(& docker run --rm --entrypoint sh $Image -c $command 2>$null) | Where-Object { $_ }
}

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    throw "Docker CLI was not found on PATH."
}

$Container = Resolve-WebContainer
$currentImage = (& docker inspect --format "{{.Config.Image}}" $Container).Trim()
if ($LASTEXITCODE -ne 0 -or -not $currentImage) {
    throw "Could not determine the image used by '$Container'."
}
if (-not $BaseImage) { $BaseImage = $currentImage }
if (-not $Tag) { $Tag = $currentImage }

$containerConfigs = Get-ContainerPluginConfigs $Container
$baseConfigs = Get-ImagePluginConfigs $BaseImage
$notBakedIntoBase = @($containerConfigs | Where-Object { $_ -notin $baseConfigs })
if ($notBakedIntoBase.Count -gt 0) {
    throw @"
Refusing to build from '$BaseImage' because these OMERO.web configurations
exist only in the running container and would be lost:
  $($notBakedIntoBase -join "`n  ")
First bake those plugins into the base image, then rerun this command.
"@
}

$python = Get-HostPython
if (-not $SkipBuild) {
    Push-Location $RepoRoot
    try {
        if (-not $SkipFrontend) {
            & $python scripts/build_frontend.py --skip-install
        }
        else {
            & $python scripts/build_frontend.py --validate-only
        }
        if ($LASTEXITCODE -ne 0) { throw "Frontend build or validation failed." }

        $buildDirectory = Join-Path $RepoRoot "build"
        if (Test-Path -LiteralPath $buildDirectory) {
            $resolvedBuild = (Resolve-Path -LiteralPath $buildDirectory).Path
            if (-not $resolvedBuild.StartsWith($RepoRoot, [System.StringComparison]::OrdinalIgnoreCase)) {
                throw "Refusing to clean build directory outside the repository: $resolvedBuild"
            }
            Remove-Item -LiteralPath $resolvedBuild -Recurse -Force
        }

        & $python -m build --wheel --no-isolation
        if ($LASTEXITCODE -ne 0) { throw "Wheel build failed." }
    }
    finally {
        Pop-Location
    }
}

$wheel = Get-ChildItem (Join-Path $RepoRoot "dist\biomero_zarr_viewer-*.whl") |
    Sort-Object LastWriteTime -Descending |
    Select-Object -First 1
if (-not $wheel) { throw "No BIOMERO OME-Zarr Viewer wheel exists in dist." }

& $python (Join-Path $RepoRoot "scripts\verify_wheel.py") $wheel.FullName
if ($LASTEXITCODE -ne 0) { throw "Wheel validation failed." }

Write-Host "Building $Tag from the currently deployed plugin image $BaseImage"
Write-Host "Existing baked-in OMERO.web plugins will be preserved."
Push-Location $RepoRoot
try {
    & docker build `
        --build-arg "OMERO_WEB_IMAGE=$BaseImage" `
        --build-arg "VIEWER_WHEEL=dist/$($wheel.Name)" `
        --file docker/Dockerfile.omeroweb `
        --tag $Tag `
        .
    if ($LASTEXITCODE -ne 0) { throw "Docker image build failed." }
}
finally {
    Pop-Location
}

Write-Host "Built $Tag. Recreate only the OMERO.web service, then restart its reverse proxy."
