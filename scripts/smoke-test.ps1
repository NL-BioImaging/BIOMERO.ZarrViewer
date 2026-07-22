[CmdletBinding()]
param(
    [Parameter(Mandatory)][string] $BaseUrl,
    [Parameter(Mandatory)][int] $ImageId,
    [Parameter(Mandatory)][string] $Cookie
)

$ErrorActionPreference = "Stop"
$base = $BaseUrl.TrimEnd("/")
$headers = @{ Cookie = $Cookie; Accept = "application/json" }
$capability = Invoke-RestMethod -Uri "$base/biomero_zarr_viewer/api/images/$ImageId/capabilities/" -Headers $headers
if (-not $capability.supported) { throw "Capability endpoint rejected image $ImageId." }
if (-not $capability.store.context) { throw "Capability response contains no signed read context." }
$headers["X-OMERO-Zarr-Context"] = $capability.store.context
$metadataName = if ($capability.zarr_format -eq 3) { "zarr.json" } else { ".zattrs" }
$response = Invoke-WebRequest -Uri ($base + $capability.store.url + $metadataName) -Headers $headers
if ($response.StatusCode -ne 200) { throw "Metadata request returned $($response.StatusCode)." }
Write-Host "Smoke test passed: NGFF $($capability.ngff_version), Zarr v$($capability.zarr_format), $($capability.kind)."

