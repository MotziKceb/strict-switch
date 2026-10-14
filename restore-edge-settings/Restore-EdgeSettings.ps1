<#
.SYNOPSIS
    Restores user control over selected Microsoft Edge settings that were
    locked by Chris Titus Tech WinUtil (or any other debloat tool) via policy.

.DESCRIPTION
    Debloat tools disable Edge features by writing values under the Edge
    policy registry keys. While a policy value exists, the matching toggle in
    edge://settings is greyed out ("This setting is managed by your
    organization"). Deleting the value hands control back to you, so you can
    turn the feature on (or off) yourself.

    Settings restored:
      * Show suggestions from history, favorites and other data on this
        device using your typed characters        -> LocalProvidersEnabled
      * Show search and site suggestions using your typed characters
                                                   -> SearchSuggestEnabled
      * Writing assistance (Microsoft Editor spelling/grammar, synonyms,
        Copilot Compose, spellcheck)               -> MicrosoftEditorProofingEnabled,
                                                      MicrosoftEditorSynonymsEnabled,
                                                      ComposeInlineEnabled,
                                                      SpellcheckEnabled

    Nothing else from the debloat is touched.

.NOTES
    Run from an elevated PowerShell (Run as administrator), then fully
    restart Edge. Use -WhatIf to preview.
#>
[CmdletBinding(SupportsShouldProcess)]
param()

$policyNames = @(
    'LocalProvidersEnabled'
    'SearchSuggestEnabled'
    'MicrosoftEditorProofingEnabled'
    'MicrosoftEditorSynonymsEnabled'
    'ComposeInlineEnabled'
    'SpellcheckEnabled'
)

$policyKeys = @(
    'HKLM:\SOFTWARE\Policies\Microsoft\Edge'
    'HKLM:\SOFTWARE\Policies\Microsoft\Edge\Recommended'
    'HKLM:\SOFTWARE\WOW6432Node\Policies\Microsoft\Edge'
    'HKCU:\SOFTWARE\Policies\Microsoft\Edge'
    'HKCU:\SOFTWARE\Policies\Microsoft\Edge\Recommended'
)

$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).
    IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
    Write-Warning 'Not running as administrator. HKLM policies cannot be removed. Re-run from an elevated PowerShell.'
}

$removed = 0
foreach ($key in $policyKeys) {
    if (-not (Test-Path $key)) { continue }
    $props = Get-ItemProperty -Path $key
    foreach ($name in $policyNames) {
        if ($null -eq $props.PSObject.Properties[$name]) { continue }
        if ($PSCmdlet.ShouldProcess("$key\$name (current value: $($props.$name))", 'Remove policy value')) {
            try {
                Remove-ItemProperty -Path $key -Name $name -ErrorAction Stop
                Write-Host "Removed $key\$name" -ForegroundColor Green
                $removed++
            } catch {
                Write-Warning "Could not remove $key\$name : $($_.Exception.Message)"
            }
        }
    }
}

if ($removed -eq 0) {
    Write-Host 'No matching Edge policy values were found (nothing to remove).' -ForegroundColor Yellow
} else {
    Write-Host ''
    Write-Host "Removed $removed policy value(s)." -ForegroundColor Green
}

Write-Host @'

Next steps:
  1. Close Edge completely (also from the system tray) and reopen it.
  2. Open edge://policy and click "Reload policies" to confirm they are gone.
  3. Turn the features on:
     - edge://settings/privacy  > Services > Address bar and search
         * Show me search and site suggestions using my typed characters
         * Show me suggestions from history, favorites and other data on this device...
     - edge://settings/languages > Writing assistance
'@
