param(
  [string]$OutputPath,
  [switch]$Force
)

$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent $PSScriptRoot
$version = (Get-Content -LiteralPath (Join-Path $repo 'package.json') -Raw | ConvertFrom-Json).version
$portable = Join-Path $repo ("releases\SteamEdge-v{0}-win-x64" -f $version)
if (-not (Test-Path -LiteralPath (Join-Path $portable 'SteamEdge.exe') -PathType Leaf)) {
  throw 'Build the public portable app first with npm run build:win.'
}
if (-not $OutputPath) { $OutputPath = Join-Path $repo ("releases\SteamEdge-Setup-{0}-English.exe" -f $version) }
$OutputPath = [IO.Path]::GetFullPath($OutputPath)
if ((Test-Path -LiteralPath $OutputPath) -and -not $Force) { throw "Output exists: $OutputPath. Pass -Force to replace it." }

$icon = Join-Path $repo 'src\assets\icon.ico'
if (-not (Test-Path -LiteralPath $icon -PathType Leaf)) {
  $electron = Join-Path $repo 'node_modules\.bin\electron.cmd'
  if (-not (Test-Path -LiteralPath $electron -PathType Leaf)) { throw 'Run npm ci before building the installer.' }
  & $electron (Join-Path $repo 'build\make-icon.js')
  if ($LASTEXITCODE -ne 0 -or -not (Test-Path -LiteralPath $icon -PathType Leaf)) { throw 'Icon generation failed.' }
}

$compiler = Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'
if (-not (Test-Path -LiteralPath $compiler -PathType Leaf)) { throw 'The Windows .NET Framework C# compiler is required.' }
Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem

$tempZip = Join-Path $env:TEMP ("SteamEdge-public-{0}.zip" -f [guid]::NewGuid().ToString('N'))
$tempUninstaller = Join-Path $env:TEMP ("SteamEdge-uninstaller-{0}.exe" -f [guid]::NewGuid().ToString('N'))
$references = @('/nologo', '/target:winexe', '/platform:x64', '/optimize+',
  '/r:System.Windows.Forms.dll', '/r:System.Drawing.dll',
  '/r:System.IO.Compression.dll', '/r:System.IO.Compression.FileSystem.dll')
try {
  $sourceRoot = [IO.Path]::GetFullPath($portable).TrimEnd([IO.Path]::DirectorySeparatorChar) + [IO.Path]::DirectorySeparatorChar
  $files = @(Get-ChildItem -LiteralPath $portable -File -Recurse)
  $publicFiles = @()
  foreach ($file in $files) {
    $relative = $file.FullName.Substring($sourceRoot.Length).Replace('\', '/')
    if ($relative -match '^(?i:settings|cache)/') { continue }
    if ($relative -match '(?i)(^|/)(session|accounts|web-session|credentials|secrets|steamid)[^/]*\.json$') {
      throw "Account data was found in the portable build: $relative"
    }
    $publicFiles += [pscustomobject]@{ File = $file; Relative = $relative }
  }
  if ($publicFiles.Count -lt 2) { throw 'The portable app is incomplete.' }

  $zipStream = [IO.File]::Open($tempZip, [IO.FileMode]::CreateNew)
  try {
    $archive = [IO.Compression.ZipArchive]::new($zipStream, [IO.Compression.ZipArchiveMode]::Create, $false)
    try {
      foreach ($item in $publicFiles) {
        [IO.Compression.ZipFileExtensions]::CreateEntryFromFile(
          $archive, $item.File.FullName, $item.Relative, [IO.Compression.CompressionLevel]::Optimal) | Out-Null
      }
    } finally { $archive.Dispose() }
  } finally { $zipStream.Dispose() }

  $source = Join-Path $PSScriptRoot 'Installer.cs'
  & $compiler @($references + @('/define:UNINSTALL_ONLY', "/out:$tempUninstaller", "/win32icon:$icon", $source))
  if ($LASTEXITCODE -ne 0) { throw 'Uninstaller compilation failed.' }
  New-Item -ItemType Directory -Force -Path (Split-Path -Parent $OutputPath) | Out-Null
  & $compiler @($references + @("/out:$OutputPath", "/win32icon:$icon",
    "/resource:$tempZip,SteamEdge.Payload.zip", "/resource:$tempUninstaller,SteamEdge.Uninstaller.exe", $source))
  if ($LASTEXITCODE -ne 0) { throw 'Installer compilation failed.' }

  $assembly = [Reflection.Assembly]::LoadFrom($OutputPath)
  $names = $assembly.GetManifestResourceNames()
  if ($names -notcontains 'SteamEdge.Payload.zip' -or $names -notcontains 'SteamEdge.Uninstaller.exe') {
    throw 'The installer is missing its application payload or uninstaller.'
  }
  [pscustomobject]@{
    Installer = $OutputPath
    PublicFiles = $publicFiles.Count
    Bytes = (Get-Item -LiteralPath $OutputPath).Length
    SHA256 = (Get-FileHash -Algorithm SHA256 -LiteralPath $OutputPath).Hash
  }
} finally {
  foreach ($tempFile in @($tempZip, $tempUninstaller)) {
    if (Test-Path -LiteralPath $tempFile -PathType Leaf) { Remove-Item -LiteralPath $tempFile -Force }
  }
}
