[CmdletBinding()]
param(
    [string]$OutputDirectory = "artifacts"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$repositoryRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot ".."))
$versionPath = Join-Path $repositoryRoot "version.txt"
$version = [System.IO.File]::ReadAllText($versionPath).Trim()

if ($version -notmatch '^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$') {
    throw "version.txt must contain one semantic version, for example 1.2.3 or 1.2.3-beta.1."
}

function Set-PackageVersion {
    param(
        [Parameter(Mandatory = $true)][string]$Path,
        [Parameter(Mandatory = $true)][string]$Value
    )

    $content = [System.IO.File]::ReadAllText($Path)
    $pattern = '(?m)^(\s*"version"\s*:\s*")[^"]+("\s*,)'
    $matches = [System.Text.RegularExpressions.Regex]::Matches($content, $pattern)
    if ($matches.Count -ne 1) {
        throw "Expected exactly one top-level version field in $Path."
    }

    $versionRegex = [System.Text.RegularExpressions.Regex]::new($pattern)
    $updated = $versionRegex.Replace(
        $content,
        { param($match) $match.Groups[1].Value + $Value + $match.Groups[2].Value },
        1
    )
    if ($updated -ne $content) {
        [System.IO.File]::WriteAllText($Path, $updated, [System.Text.UTF8Encoding]::new($false))
    }
}

Set-PackageVersion -Path (Join-Path $repositoryRoot "package.json") -Value $version
Set-PackageVersion -Path (Join-Path $repositoryRoot "plugin/package.json") -Value $version

Push-Location $repositoryRoot
try {
    & corepack pnpm --filter '@cider-netease/shared' build
    if ($LASTEXITCODE -ne 0) {
        throw "Shared package build failed; no release archive was created."
    }

    & corepack pnpm --filter '@cider-netease/plugin' test
    if ($LASTEXITCODE -ne 0) {
        throw "Plugin tests failed; no release archive was created."
    }

    & corepack pnpm --filter '@cider-netease/plugin' build
    if ($LASTEXITCODE -ne 0) {
        throw "Plugin build failed; no release archive was created."
    }
}
finally {
    Pop-Location
}

$distDirectory = Join-Path $repositoryRoot "plugin/dist"
$requiredReleasePaths = @(
    "plugin.js",
    "plugin.yml",
    "icon.png",
    "THIRD_PARTY_LICENSES.txt"
)
$distFiles = @(Get-ChildItem -LiteralPath $distDirectory -File -Recurse | ForEach-Object {
    [PSCustomObject]@{
        ArchivePath = [System.IO.Path]::GetRelativePath($distDirectory, $_.FullName).Replace('\', '/')
        SourcePath = $_.FullName
    }
})

foreach ($requiredPath in $requiredReleasePaths) {
    if ($requiredPath -notin $distFiles.ArchivePath) {
        throw "Required plugin file is missing: $requiredPath"
    }
}

$dynamicChunks = @($distFiles | Where-Object { $_.ArchivePath -match '^assets/cn2t-[A-Za-z0-9_-]+\.js$' })
if ($dynamicChunks.Count -ne 1) {
    throw "Expected exactly one hashed OpenCC chunk under assets/, found $($dynamicChunks.Count)."
}

$allowedReleasePaths = @($requiredReleasePaths) + @($dynamicChunks.ArchivePath)
$unexpectedFiles = @($distFiles | Where-Object { $_.ArchivePath -notin $allowedReleasePaths })
if ($unexpectedFiles.Count -gt 0) {
    throw "Unexpected files in plugin dist: $($unexpectedFiles.ArchivePath -join ', ')"
}

$releaseFiles = @($distFiles | Where-Object { $_.ArchivePath -in $allowedReleasePaths } | Sort-Object ArchivePath)
foreach ($entry in $releaseFiles) {
    $segments = $entry.ArchivePath -split '/'
    if ([System.IO.Path]::IsPathRooted($entry.ArchivePath) -or $segments -contains '..') {
        throw "Unsafe plugin archive path: $($entry.ArchivePath)"
    }
}

$manifestPath = ($releaseFiles | Where-Object ArchivePath -eq "plugin.yml").SourcePath
$manifest = [System.IO.File]::ReadAllText($manifestPath)
$escapedVersion = [System.Text.RegularExpressions.Regex]::Escape($version)
if ($manifest -notmatch "(?m)^version:\s*$escapedVersion\s*$") {
    throw "Built plugin.yml does not contain version $version."
}

$pluginEntryPath = ($releaseFiles | Where-Object ArchivePath -eq "plugin.js").SourcePath
$pluginEntry = [System.IO.File]::ReadAllText($pluginEntryPath)
if (-not $pluginEntry.Contains($dynamicChunks[0].ArchivePath)) {
    throw "plugin.js does not reference the packaged OpenCC chunk $($dynamicChunks[0].ArchivePath)."
}

$outputPath = if ([System.IO.Path]::IsPathRooted($OutputDirectory)) {
    [System.IO.Path]::GetFullPath($OutputDirectory)
}
else {
    [System.IO.Path]::GetFullPath((Join-Path $repositoryRoot $OutputDirectory))
}
[System.IO.Directory]::CreateDirectory($outputPath) | Out-Null

$archiveName = "dev.masterain.cider-netease-lyrics-$version.zip"
$archivePath = Join-Path $outputPath $archiveName
$checksumPath = "$archivePath.sha256"

foreach ($target in @($archivePath, $checksumPath)) {
    if ([System.IO.File]::Exists($target)) {
        [System.IO.File]::Delete($target)
    }
}

Add-Type -AssemblyName System.IO.Compression
$archiveStream = [System.IO.File]::Open($archivePath, [System.IO.FileMode]::CreateNew)
$archive = $null
try {
    $archive = [System.IO.Compression.ZipArchive]::new(
        $archiveStream,
        [System.IO.Compression.ZipArchiveMode]::Create,
        $false
    )
    foreach ($entry in $releaseFiles) {
        $zipEntry = $archive.CreateEntry($entry.ArchivePath, [System.IO.Compression.CompressionLevel]::Optimal)
        $destination = $zipEntry.Open()
        $source = [System.IO.File]::OpenRead($entry.SourcePath)
        try {
            $source.CopyTo($destination)
        }
        finally {
            $source.Dispose()
            $destination.Dispose()
        }
    }
}
finally {
    if ($null -ne $archive) {
        $archive.Dispose()
    }
    $archiveStream.Dispose()
}

$hash = (Get-FileHash -LiteralPath $archivePath -Algorithm SHA256).Hash.ToLowerInvariant()
[System.IO.File]::WriteAllText(
    $checksumPath,
    "$hash  $archiveName`n",
    [System.Text.UTF8Encoding]::new($false)
)

Write-Host "Plugin $version packaged successfully."
Write-Host "Archive: $archivePath"
Write-Host "SHA-256: $checksumPath"
