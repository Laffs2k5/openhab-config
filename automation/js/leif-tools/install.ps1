#!/bin/env pwsh
$parent = (Join-Path -Path "$PSScriptRoot" -ChildPath "..")
Set-Location "$parent"
#Write-Host "pwd: $pwd"
#Write-Host "scripttoot: $PSScriptRoot"
& npm pack "$PSScriptRoot"
$tar = Join-Path -Path "$parent" -ChildPath "leif-tools-1.0.0.tgz"
#Write-Host "tar: $tar"
& npm install $tar
Remove-Item $tar