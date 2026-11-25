<#
.SYNOPSIS
  Publish the newest installers from Share\all-latest as a GitHub Release on j-mav/darwinstudio and point
  plugins.html at them (links, versions, sizes).

.DESCRIPTION
  Takes SF-Bundle-* from ..\Share\all-latest\ and every SF-* installer from ..\Share\all-latest\individual\.
  Creates one release (tag default: downloads-<today>) holding all of them, then rewrites plugins.html.
  It does not commit or push the page: review the diff, then commit and push.

  This is an outward action (public upload). Run it only after the user said yes.

.EXAMPLE
  .\scripts\update-downloads.ps1 -DryRun     # show what would change, upload nothing, write nothing
  .\scripts\update-downloads.ps1             # upload and rewrite plugins.html
#>
param(
    [string]$Tag = ("downloads-" + (Get-Date -Format 'yyyy-MM-dd')),
    [string]$Repo = 'j-mav/darwinstudio',
    [switch]$DryRun,
    [switch]$PageOnly   # rewrite plugins.html for an existing release, upload nothing
)
$ErrorActionPreference = 'Stop'
$site = Split-Path $PSScriptRoot -Parent
$share = Join-Path (Split-Path $site -Parent) 'Share\all-latest'
$gh = 'C:\Program Files\GitHub CLI\gh.exe'
$pattern = '^SF-(?<p>[A-Za-z]+)-(?<v>\d+\.\d+\.\d+)-(?<plat>macOS|Windows)\.(?<ext>zip|exe)$'

$files = @(Get-ChildItem $share -File | Where-Object { $_.Name -match '^SF-Bundle-' -and $_.Name -match $pattern })
$files += @(Get-ChildItem (Join-Path $share 'individual') -File | Where-Object { $_.Name -match $pattern })
if ($files.Count -eq 0) { throw "No installers found in $share" }

$page = Join-Path $site 'plugins.html'   # the page with the download links
$html = [IO.File]::ReadAllText($page)
$orig = $html
foreach ($f in $files) {
    $null = $f.Name -match $pattern
    $p = $Matches.p; $v = $Matches.v; $plat = $Matches.plat
    $mb = [math]::Max(1, [math]::Round($f.Length / 1MB))
    # link + size inside the same <a>
    $dot = [string][char]0xB7   # the middle dot before the size; kept out of the file text (PS 5.1 reads it as ANSI)
    $rx = "(?s)(releases/download/)[^/""]+/SF-$p-[\d.]+-$plat\.(zip|exe)("">.*?<small>[^<]*?$dot )\d+ MB"
    $hits = [regex]::Matches($html, $rx).Count
    if ($hits -eq 0) { Write-Warning "$($f.Name): no link for SF-$p ($plat) in plugins.html" }
    $html = [regex]::Replace($html, $rx, { param($m) "$($m.Groups[1].Value)$Tag/$($f.Name)$($m.Groups[3].Value)$mb MB" })
    $html = [regex]::Replace($html, "(data-product=""$p"">)[\d.]+(<)", "`${1}$v`${2}")
    "{0,-34} {1,4} MB  links: {2}" -f $f.Name, $mb, $hits
}

if ($DryRun) {
    if ($html -eq $orig) { 'plugins.html: no change' } else { 'plugins.html: would change (dry run, nothing written)' }
    return
}

if (-not $PageOnly) {
    $notes = "Installers for the Darwin Studio Set & Forget plugins. See https://j-mav.github.io/darwinstudio/"
    # gh reads "path#text" as a file plus a display label, and the workspace path holds "#Documents".
    # So run from Share\all-latest and pass paths relative to it, which have no "#".
    $rel = $files | ForEach-Object { if ($_.DirectoryName -eq (Resolve-Path $share).Path) { $_.Name } else { "individual\$($_.Name)" } }
    Push-Location $share
    try {
        & $gh release create $Tag @($rel) --repo $Repo --title "Downloads $($Tag -replace '^downloads-','')" --notes $notes
        if ($LASTEXITCODE -ne 0) { throw "gh release create failed ($LASTEXITCODE)" }
    } finally { Pop-Location }
}

[IO.File]::WriteAllText($page, $html, (New-Object Text.UTF8Encoding($false)))
"plugins.html updated for $Tag. Review with: git -C `"$site`" diff, then commit and push."
