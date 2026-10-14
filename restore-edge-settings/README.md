# Restore Edge settings locked by WinUtil debloat

Chris Titus Tech WinUtil (and similar tools) disable Edge features by writing
policy values to the registry. That greys the settings out with "managed by
your organization". These files delete **only** the policies below, so the
toggles are yours again. Every other debloat tweak stays in place.

| Edge setting | Policy removed |
| --- | --- |
| Show suggestions from history, favorites and other data on this device using your typed characters | `LocalProvidersEnabled` |
| Show search and site suggestions using your typed characters | `SearchSuggestEnabled` |
| Writing assistance (Microsoft Editor grammar/spelling) | `MicrosoftEditorProofingEnabled` |
| Writing assistance (synonyms) | `MicrosoftEditorSynonymsEnabled` |
| Compose / Copilot writing help | `ComposeInlineEnabled` |
| Spellcheck | `SpellcheckEnabled` |

## Usage

Pick one:

- **PowerShell (recommended):** open PowerShell as administrator and run
  ```powershell
  Set-ExecutionPolicy -Scope Process Bypass
  .\Restore-EdgeSettings.ps1 -WhatIf   # preview
  .\Restore-EdgeSettings.ps1           # apply
  ```
  It reports exactly which values it removed.
- **.reg file:** double-click `Restore-EdgeSettings.reg` and accept the prompt.

Then:

1. Fully close Edge (including the tray icon) and reopen it.
2. Go to `edge://policy`, click **Reload policies** and check that those
   policies are no longer listed.
3. Turn the features on:
   - `edge://settings/privacy` > **Services** > **Address bar and search**
   - `edge://settings/languages` > **Writing assistance**

If a setting is still greyed out, look it up in `edge://policy`. The
**Source** column shows where it comes from. If it lists a policy name not in
the table, add that name to the script and run it again.
