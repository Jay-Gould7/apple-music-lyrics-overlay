$OutputEncoding = [System.Text.UTF8Encoding]::new($false)
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)

Add-Type -AssemblyName System.Runtime.WindowsRuntime

[Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager, Windows.Media.Control, ContentType = WindowsRuntime] | Out-Null
[Windows.Media.Control.GlobalSystemMediaTransportControlsSession, Windows.Media.Control, ContentType = WindowsRuntime] | Out-Null
[Windows.Media.Control.GlobalSystemMediaTransportControlsSessionPlaybackStatus, Windows.Media.Control, ContentType = WindowsRuntime] | Out-Null
[Windows.Foundation.IAsyncOperation`1, Windows.Foundation, ContentType = WindowsRuntime] | Out-Null

function Await-WinRTTask {
  param(
    [Parameter(Mandatory = $true)]
    $Operation,
    [Parameter(Mandatory = $true)]
    [Type]$ResultType
  )

  $asTaskMethod = [System.WindowsRuntimeSystemExtensions].GetMethods() |
    Where-Object {
      $_.Name -eq 'AsTask' -and
      $_.IsGenericMethod -and
      $_.GetParameters().Count -eq 1
    } |
    Select-Object -First 1

  $genericMethod = $asTaskMethod.MakeGenericMethod($ResultType)
  $task = $genericMethod.Invoke($null, @($Operation))
  $task.Wait()
  return $task.Result
}

function Get-PlaybackStatusText {
  param(
    [Parameter(Mandatory = $true)]
    $Status
  )

  switch ($Status.ToString()) {
    'Playing' { return 'playing' }
    'Paused' { return 'paused' }
    'Stopped' { return 'stopped' }
    default { return 'unknown' }
  }
}

function Convert-TimeSpanToMilliseconds {
  param(
    [Parameter(Mandatory = $true)]
    $TimeSpan
  )

  if ($null -eq $TimeSpan) {
    return 0
  }

  if ($TimeSpan -is [TimeSpan]) {
    return [math]::Max(0, [int64]$TimeSpan.TotalMilliseconds)
  }

  if ($TimeSpan.PSObject.Properties['TotalMilliseconds']) {
    return [math]::Max(0, [int64]$TimeSpan.TotalMilliseconds)
  }

  if ($TimeSpan.PSObject.Properties['Ticks']) {
    return [math]::Max(0, [int64]($TimeSpan.Ticks / 10000))
  }

  try {
    $casted = [TimeSpan]$TimeSpan
    return [math]::Max(0, [int64]$casted.TotalMilliseconds)
  } catch {
    return 0
  }
}

function Select-AppleMusicSession {
  param(
    [Parameter(Mandatory = $true)]
    $Manager
  )

  $sessions = $Manager.GetSessions()
  $playingAppleMusicSession = $null
  $fallbackAppleMusicSession = $null

  foreach ($session in $sessions) {
    $appId = ''

    try {
      $appId = $session.SourceAppUserModelId
    } catch {
      $appId = ''
    }

    if ($appId -notmatch 'apple.*music|itunes') {
      continue
    }

    if ($null -eq $fallbackAppleMusicSession) {
      $fallbackAppleMusicSession = $session
    }

    try {
      $playback = $session.GetPlaybackInfo()

      if ($playback.PlaybackStatus.ToString() -eq 'Playing') {
        return $session
      }
    } catch {
    }

    try {
      $propertiesOperation = $session.TryGetMediaPropertiesAsync()
      $properties = Await-WinRTTask -Operation $propertiesOperation -ResultType ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionMediaProperties])

      if ($null -eq $playingAppleMusicSession -and (($properties.Title | Out-String).Trim() -or ($properties.Artist | Out-String).Trim())) {
        $playingAppleMusicSession = $session
      }
    } catch {
    }
  }

  if ($null -ne $playingAppleMusicSession) {
    return $playingAppleMusicSession
  }

  if ($null -ne $fallbackAppleMusicSession) {
    return $fallbackAppleMusicSession
  }

  try {
    $currentSession = $Manager.GetCurrentSession()

    if ($null -ne $currentSession) {
      $currentAppId = $currentSession.SourceAppUserModelId

      if ($currentAppId -match 'apple.*music|itunes') {
        return $currentSession
      }
    }
  } catch {
  }

  return $null
}

$empty = [pscustomobject]@{
  title = ''
  artist = ''
  album = ''
  positionMs = 0
  durationMs = 0
  status = 'unknown'
  sourceAppId = ''
}

try {
  $managerOperation = [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager]::RequestAsync()
  $manager = Await-WinRTTask -Operation $managerOperation -ResultType ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager])
  $session = Select-AppleMusicSession -Manager $manager

  if ($null -eq $session) {
    $empty | ConvertTo-Json -Compress
    exit 0
  }

  $appId = ''

  try {
    $appId = $session.SourceAppUserModelId
  } catch {
    $appId = ''
  }

  $propertiesOperation = $session.TryGetMediaPropertiesAsync()
  $properties = Await-WinRTTask -Operation $propertiesOperation -ResultType ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionMediaProperties])
  $timeline = $session.GetTimelineProperties()
  $playback = $session.GetPlaybackInfo()

  $result = [pscustomobject]@{
    title = if ($null -ne $properties.Title) { [string]$properties.Title } else { '' }
    artist = if ($null -ne $properties.Artist) { [string]$properties.Artist } else { '' }
    album = if ($null -ne $properties.AlbumTitle) { [string]$properties.AlbumTitle } else { '' }
    positionMs = Convert-TimeSpanToMilliseconds -TimeSpan $timeline.Position
    durationMs = Convert-TimeSpanToMilliseconds -TimeSpan $timeline.EndTime
    status = Get-PlaybackStatusText -Status $playback.PlaybackStatus
    sourceAppId = $appId
  }

  $result | ConvertTo-Json -Compress
} catch {
  $errorResult = [pscustomobject]@{
    title = ''
    artist = ''
    album = ''
    positionMs = 0
    durationMs = 0
    status = 'unknown'
    sourceAppId = ''
    error = $_.Exception.Message
  }

  $errorResult | ConvertTo-Json -Compress
  exit 0
}
