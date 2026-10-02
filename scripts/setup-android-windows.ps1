<#
.SYNOPSIS
  Applies and verifies this Windows machine's local Android build setup for oda.

.DESCRIPTION
  Safe to re-run. Checks, and repairs where it can:
    1. ninja 1.12+ inside the Android SDK's CMake 3.22.1 (decision #28). The old ninja is kept
       as ninja-<version>.exe. CMake 3.31.6 (the ninja source) is installed with sdkmanager
       if it's missing.
    2. The Gradle limits in ~/.gradle/gradle.properties, sized from the RAM Windows reports
       (decisions #23, #29, #30, #35): 32 GB or more -> -Xmx6g, 6 workers, parallel builds;
       less -> -Xmx2560m, 1 worker, no parallel builds. Other lines are kept.
    3. Windows long paths (reported only: turning them on needs an administrator).

.PARAMETER Check
  Only report; change nothing.

.EXAMPLE
  pwsh -File scripts/setup-android-windows.ps1
  pwsh -File scripts/setup-android-windows.ps1 -Check
#>
[CmdletBinding()]
param([switch]$Check)

$ErrorActionPreference = 'Stop'
$results = [System.Collections.Generic.List[object]]::new()

function Add-Result([string]$Item, [string]$State, [string]$Detail) {
  $results.Add([pscustomobject]@{ Item = $Item; State = $State; Detail = $Detail })
}

function Get-NinjaVersion([string]$Path) {
  if (-not (Test-Path $Path)) { return $null }
  try { return [version]((& $Path --version) | Select-Object -First 1).Trim() } catch { return $null }
}

# --- Android SDK ------------------------------------------------------------------------------
$sdk = @($env:ANDROID_HOME, $env:ANDROID_SDK_ROOT, (Join-Path $env:LOCALAPPDATA 'Android\Sdk')) |
  Where-Object { $_ -and (Test-Path $_) } | Select-Object -First 1
if (-not $sdk) {
  Write-Error 'Android SDK not found: set ANDROID_HOME (Android Studio -> SDK Manager shows the path).'
}
$sdkmanager = Join-Path $sdk 'cmdline-tools\latest\bin\sdkmanager.bat'

function Install-SdkPackage([string]$Package) {
  if (-not (Test-Path $sdkmanager)) {
    throw "sdkmanager not found at $sdkmanager. Install 'Android SDK Command-line Tools (latest)' in Android Studio -> SDK Manager -> SDK Tools."
  }
  Write-Host "Installing $Package with sdkmanager..."
  'y' | & $sdkmanager --install $Package | Out-Host
  if ($LASTEXITCODE -ne 0) { throw "sdkmanager failed to install $Package" }
}

# --- 1. ninja 1.12+ in CMake 3.22.1 -----------------------------------------------------------
$minNinja = [version]'1.12.0'
$cmakeBin = Join-Path $sdk 'cmake\3.22.1\bin'
$ninja = Join-Path $cmakeBin 'ninja.exe'
$sourceNinja = Join-Path $sdk 'cmake\3.31.6\bin\ninja.exe'

try {
  if (-not (Test-Path $cmakeBin)) {
    if ($Check) { throw 'CMake 3.22.1 is not installed (React Native builds need it)' }
    Install-SdkPackage 'cmake;3.22.1'
  }
  $current = Get-NinjaVersion $ninja
  if ($current -and $current -ge $minNinja) {
    Add-Result 'ninja in CMake 3.22.1' 'OK' "$current"
  } elseif ($Check) {
    Add-Result 'ninja in CMake 3.22.1' 'WRONG' "$(if ($current) { $current } else { 'missing' }); needs $minNinja+ (run without -Check)"
  } else {
    if ((Get-NinjaVersion $sourceNinja) -lt $minNinja) { Install-SdkPackage 'cmake;3.31.6' }
    $source = Get-NinjaVersion $sourceNinja
    if (-not $source -or $source -lt $minNinja) { throw "CMake 3.31.6's ninja is $source, not $minNinja+" }
    if ($current) {
      $backup = Join-Path $cmakeBin "ninja-$current.exe"
      if (-not (Test-Path $backup)) { Copy-Item $ninja $backup }
    }
    Copy-Item $sourceNinja $ninja -Force
    $after = Get-NinjaVersion $ninja
    if ($after -lt $minNinja) { throw "copied ninja still reports $after" }
    Add-Result 'ninja in CMake 3.22.1' 'FIXED' "$(if ($current) { $current } else { 'missing' }) -> $after"
  }
} catch {
  Add-Result 'ninja in CMake 3.22.1' 'FAILED' $_.Exception.Message
}

# --- 2. Gradle limits from RAM ----------------------------------------------------------------
$ramGb = [math]::Round((Get-CimInstance Win32_ComputerSystem).TotalPhysicalMemory / 1GB, 1)
# A "32 GB" laptop shows about 31.7 GB to Windows.
$big = $ramGb -ge 30
$tier = if ($big) { "32 GB tier ($ramGb GB visible)" } else { "16 GB tier ($ramGb GB visible)" }
$heap = if ($big) { '6g' } else { '2560m' }
$wanted = [ordered]@{
  'org.gradle.jvmargs'                  = "-Xmx$heap -XX:MaxMetaspaceSize=768m -XX:+HeapDumpOnOutOfMemoryError -Dfile.encoding=UTF-8"
  'org.gradle.parallel'                 = $(if ($big) { 'true' } else { 'false' })
  'org.gradle.workers.max'              = $(if ($big) { '6' } else { '1' })
  'org.gradle.daemon.idletimeout'       = '600000'
  'kotlin.daemon.jvmargs'               = '-Xmx1536m'
  'kotlin.compiler.execution.strategy'  = 'in-process'
  'reactNativeArchitectures'            = 'arm64-v8a'
}
$gradleHome = if ($env:GRADLE_USER_HOME) { $env:GRADLE_USER_HOME } else { Join-Path $HOME '.gradle' }
$props = Join-Path $gradleHome 'gradle.properties'

try {
  $lines = [System.Collections.Generic.List[string]]::new()
  if (Test-Path $props) { foreach ($l in (Get-Content $props)) { $lines.Add($l) } }
  $changed = [System.Collections.Generic.List[string]]::new()
  foreach ($key in $wanted.Keys) {
    $index = -1
    for ($i = 0; $i -lt $lines.Count; $i++) {
      if ($lines[$i] -match "^\s*$([regex]::Escape($key))\s*=") { $index = $i; break }
    }
    $line = "$key=$($wanted[$key])"
    if ($index -lt 0) { $lines.Add($line); $changed.Add($key) }
    elseif ($lines[$index].Trim() -ne $line) { $lines[$index] = $line; $changed.Add($key) }
  }
  if ($changed.Count -eq 0) {
    Add-Result 'Gradle limits' 'OK' $tier
  } elseif ($Check) {
    Add-Result 'Gradle limits' 'WRONG' "$tier; differs: $($changed -join ', ') (run without -Check)"
  } else {
    New-Item -ItemType Directory -Force $gradleHome | Out-Null
    if (Test-Path $props) { Copy-Item $props "$props.bak" -Force }
    $text = ($lines -join "`n") + "`n"
    [System.IO.File]::WriteAllText($props, $text, [System.Text.UTF8Encoding]::new($false))
    Add-Result 'Gradle limits' 'FIXED' "$tier; set $($changed -join ', ') (previous file: gradle.properties.bak)"
  }
} catch {
  Add-Result 'Gradle limits' 'FAILED' $_.Exception.Message
}

# --- 3. Windows long paths (report only) ------------------------------------------------------
$longPaths = (Get-ItemProperty 'HKLM:\SYSTEM\CurrentControlSet\Control\FileSystem' -Name LongPathsEnabled -ErrorAction SilentlyContinue).LongPathsEnabled
if ($longPaths -eq 1) {
  Add-Result 'Windows long paths' 'OK' 'enabled'
} else {
  Add-Result 'Windows long paths' 'WRONG' 'disabled: as administrator, set HKLM\SYSTEM\CurrentControlSet\Control\FileSystem LongPathsEnabled = 1, then restart'
}

# --- Report -----------------------------------------------------------------------------------
Write-Host ''
Write-Host "Android SDK: $sdk"
$results | Format-Table -AutoSize | Out-Host
$bad = @($results | Where-Object { $_.State -in 'WRONG', 'FAILED' })
if ($bad.Count -gt 0) {
  Write-Host "$($bad.Count) item(s) need attention." -ForegroundColor Red
  exit 1
}
Write-Host 'Everything is in place.' -ForegroundColor Green
exit 0
