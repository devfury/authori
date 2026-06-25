#Requires -Version 5.1
param(
  [Alias('p')]
  [switch] $Push,

  [Alias('t')]
  [string[]] $Tag,

  [string] $Engine,

  [string] $Platform,

  [Parameter(ValueFromRemainingArguments = $true)]
  [string[]] $Targets
)

$ErrorActionPreference = 'Stop'

$RootDir = Split-Path -Parent $MyInvocation.MyCommand.Path

$Registry        = if ($env:REGISTRY) { $env:REGISTRY } else { 'registry.ezcaretech.com' }
$Namespace       = if ($env:NAMESPACE) { $env:NAMESPACE } else { 'authori' }
$ContainerEngine = if ($Engine)    { $Engine }    elseif ($env:ENGINE)    { $env:ENGINE }    else { 'docker' }
$BuildPlatform   = if ($Platform)  { $Platform }  elseif ($env:PLATFORM)  { $env:PLATFORM }  else { 'linux/amd64' }
$DefaultTag      = if ($env:TAG)   { $env:TAG }   else { 'latest' }
$DoPush          = [bool] $Push

$Tags = if ($Tag -and $Tag.Count -gt 0) { $Tag } else { @($DefaultTag) }

$ValidTargets = @('web', 'api')
foreach ($t in $Targets) {
  if ($t -notin $ValidTargets) {
    Write-Error "Unknown target: $t (expected 'web' or 'api')"
  }
}
$BuildTargets = if ($Targets -and $Targets.Count -gt 0) { $Targets } else { $ValidTargets }

if ($ContainerEngine -ne 'docker' -and $ContainerEngine -ne 'podman') {
  Write-Error "Error: ENGINE must be 'docker' or 'podman' (got '$ContainerEngine')"
}

if ($DoPush -and [string]::IsNullOrEmpty($Registry)) {
  Write-Error 'Error: --push requires REGISTRY to be set'
}

if (-not $DoPush -and $BuildPlatform -match ',') {
  Write-Error 'Error: multi-platform builds require --push (cannot --load multi-arch manifests)'
}

if ($ContainerEngine -eq 'podman' -and $BuildPlatform -match ',') {
  Write-Error 'Error: Podman multi-platform builds are not supported by this script'
}

function Get-ImageRef {
  param([string] $Name, [string] $Tag)
  $prefix = $Namespace
  if (-not [string]::IsNullOrEmpty($Registry)) { $prefix = "$Registry/$prefix" }
  "$prefix/${Name}:$Tag"
}

function Invoke-Build {
  param([string] $Name)

  # 모노레포: build context 는 저장소 루트, Dockerfile 은 apps/<name>/Dockerfile
  $contextDir = $RootDir
  $dockerfile = Join-Path $RootDir "apps/$Name/Dockerfile"

  if (-not (Test-Path $dockerfile)) {
    Write-Error "Error: $dockerfile not found"
  }

  $tagArgs = @()
  foreach ($tag in $Tags) {
    $tagArgs += '-t'
    $tagArgs += (Get-ImageRef $Name $tag)
  }

  Write-Host ">>> Building $Name [$BuildPlatform] with $ContainerEngine"
  foreach ($tag in $Tags) { Write-Host "    tag: $(Get-ImageRef $Name $tag)" }

  if ($ContainerEngine -eq 'podman') {
    & podman build --platform $BuildPlatform -f $dockerfile @tagArgs $contextDir
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

    if ($DoPush) {
      foreach ($tag in $Tags) {
        & podman push (Get-ImageRef $Name $tag)
        if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
      }
    }
    return
  }

  $outputFlag = if ($DoPush) { '--push' } else { '--load' }
  & docker buildx build --platform $BuildPlatform -f $dockerfile @tagArgs $outputFlag $contextDir
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}

foreach ($target in $BuildTargets) {
  Invoke-Build $target
}

Write-Host '>>> Build completed successfully'
