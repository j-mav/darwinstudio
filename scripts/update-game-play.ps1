<#
.SYNOPSIS
  Refresh play/ (From Rust 'Til Dawn, playable in the browser at /darwinstudio/play/) from the game's browser build.

.DESCRIPTION
  Replaces play/ with the contents of the game's archive\FRTD.zip (the full, non-demo browser build made by the
  game's zip-game.ps1 -Browser). Drops the files only a local server or other hosts use (server.js, _headers,
  _redirects). It does not commit or push: review, then commit and push (outward action: needs the user's yes).
  Each version adds its changed files to this repo's history (the full build is ~290 MB); GitHub's soft limit
  for a repo is 1 GB.

.EXAMPLE
  .\scripts\update-game-play.ps1
#>
param([string]$Zip)
$ErrorActionPreference = 'Stop'
$site = Split-Path $PSScriptRoot -Parent
if (-not $Zip) {
    $Zip = Join-Path (Split-Path (Split-Path $site -Parent) -Parent) 'My Games\Bay Area Turret Command\archive\FRTD.zip'
}
if (-not (Test-Path -LiteralPath $Zip)) { throw "Browser build not found: $Zip" }

$play = Join-Path $site 'play'
# Unpack outside Dropbox, then mirror into play/: only changed files are touched (less Dropbox churn), and
# robocopy retries files Dropbox has locked while it syncs.
$stage = Join-Path ([IO.Path]::GetTempPath()) 'frtd-play-stage'
if (Test-Path $stage) { Remove-Item $stage -Recurse -Force }
Expand-Archive -LiteralPath $Zip -DestinationPath $stage
foreach ($f in 'server.js', '_headers', '_redirects', 'index-demo.html') {
    $p = Join-Path $stage $f
    if (Test-Path $p) { Remove-Item $p -Force }
}
robocopy $stage $play /MIR /R:10 /W:6 /NFL /NDL /NJH /NP | Out-Null
$rc = $LASTEXITCODE
Remove-Item $stage -Recurse -Force
if ($rc -ge 8) { throw "robocopy failed ($rc)" }
$html = [IO.File]::ReadAllText((Join-Path $play 'index.html'))
if ($html -notmatch 'GAME_MODE = "win"') { throw "play/index.html is not the full build (GAME_MODE is not win)" }
$v = [regex]::Match($html, 'id="titleVersion"[^>]*>\s*v\.?\s*([\d.]+)').Groups[1].Value
$files = Get-ChildItem $play -Recurse -File
"play/ updated: v$v, {0} files, {1} MB, largest {2:N1} MB" -f $files.Count, [math]::Round(($files | Measure-Object Length -Sum).Sum / 1MB), (($files | Measure-Object Length -Max).Maximum / 1MB)
