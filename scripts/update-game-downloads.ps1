<#
.SYNOPSIS
  Publish the newest From Rust 'Til Dawn Windows build as a GitHub Release on j-mav/darwinstudio and point
  games.html at it (link, version, size).

.DESCRIPTION
  Takes the newest non-demo "From Rust Til Dawn-<ver>-win.zip" from the game's archive\win-build\ (built by the
  game's zip-game.ps1 -Win). Uploads it as FromRustTilDawn-<ver>-Windows.zip to release frtd-<ver>, then
  rewrites games.html. It does not commit or push the page: review the diff, then commit and push.

  This is an outward action (public upload). Run it only after the user said yes.

.EXAMPLE
  .\scripts\update-game-downloads.ps1 -DryRun     # show what would change, upload nothing, write nothing
  .\scripts\update-game-downloads.ps1             # upload and rewrite games.html
#>
param(
    [string]$Zip,                 # default: newest non-demo build in the game's archive\win-build
    [string]$Repo = 'j-mav/darwinstudio',
    [switch]$DryRun,
    [switch]$PageOnly             # rewrite games.html for an existing release, upload nothing
)
$ErrorActionPreference = 'Stop'
$site = Split-Path $PSScriptRoot -Parent
$gh = 'C:\Program Files\GitHub CLI\gh.exe'

if (-not $Zip) {
    $build = Join-Path (Split-Path (Split-Path $site -Parent) -Parent) 'My Games\Bay Area Turret Command\archive\win-build'
    $Zip = Get-ChildItem $build -File -Filter 'From Rust Til Dawn-*-win.zip' |
        Where-Object { $_.Name -notlike '*-demo-*' } |
        Sort-Object LastWriteTime -Descending | Select-Object -First 1 -ExpandProperty FullName
    if (-not $Zip) { throw "No non-demo build found in $build" }
}
$src = Get-Item -LiteralPath $Zip
if ($src.Name -notmatch '^From Rust Til Dawn-(?<v>\d+(\.\d+)*)-win\.zip$') { throw "Unexpected file name: $($src.Name)" }
$v = $Matches.v
$Tag = "frtd-$v"
$asset = "FromRustTilDawn-$v-Windows.zip"
$mb = [math]::Max(1, [math]::Round($src.Length / 1MB))

$page = Join-Path $site 'games.html'
$html = [IO.File]::ReadAllText($page)
$orig = $html
$dot = [string][char]0xB7   # the middle dot before the size; kept out of the file text (PS 5.1 reads it as ANSI)
$rx = "(?s)(releases/download/)[^/""]+/FromRustTilDawn-[\d.]+-Windows\.zip("">.*?<small>[^<]*?$dot )\d+ MB"
$hits = [regex]::Matches($html, $rx).Count
if ($hits -eq 0) { throw "No Windows download link found in games.html" }
$html = [regex]::Replace($html, $rx, { param($m) "$($m.Groups[1].Value)$Tag/$asset$($m.Groups[2].Value)$mb MB" })
$html = [regex]::Replace($html, '(data-product="FRTD">)[\d.]+(<)', "`${1}$v`${2}")
"{0} -> {1}  {2} MB  tag {3}  links: {4}" -f $src.Name, $asset, $mb, $Tag, $hits

if ($DryRun) {
    if ($html -eq $orig) { 'games.html: no change' } else { 'games.html: would change (dry run, nothing written)' }
    return
}

if (-not $PageOnly) {
    # Upload under a name without spaces. Stage it outside Dropbox; gh also reads "path#text" as a label,
    # and the workspace path holds "#Documents", so pass a bare file name from inside the staging folder.
    $stage = Join-Path ([IO.Path]::GetTempPath()) "frtd-release-$v"
    New-Item -ItemType Directory -Force $stage | Out-Null
    Copy-Item -LiteralPath $src.FullName (Join-Path $stage $asset) -Force
    $notes = "From Rust 'Til Dawn $v for Windows (64-bit). Free. See https://j-mav.github.io/darwinstudio/games.html"
    Push-Location $stage
    try {
        & $gh release create $Tag $asset --repo $Repo --title "From Rust 'Til Dawn $v" --notes $notes
        if ($LASTEXITCODE -ne 0) { throw "gh release create failed ($LASTEXITCODE)" }
    } finally { Pop-Location; Remove-Item $stage -Recurse -Force }
}

[IO.File]::WriteAllText($page, $html, (New-Object Text.UTF8Encoding($false)))
"games.html updated for $Tag. Review with: git -C `"$site`" diff, then commit and push."
