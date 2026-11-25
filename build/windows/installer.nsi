; Writtt Desktop — Modern Windows Installer (NSIS MUI2, Per-User No-UAC Friction)
; Preserves ~/.writtt user manuscripts & encrypted vault across upgrades and uninstalls.

Unicode True
!include "MUI2.nsh"
!include "FileFunc.nsh"

!ifndef PRODUCT_VERSION
  !define PRODUCT_VERSION "0.2.0"
!endif

!define PRODUCT_NAME "Writtt"
!define PRODUCT_PUBLISHER "Writtt Studio"
!define PRODUCT_WEB_SITE "https://www.writtt.com"
!define UNINSTALL_KEY "Software\Microsoft\Windows\CurrentVersion\Uninstall\Writtt"

Name "${PRODUCT_NAME} ${PRODUCT_VERSION}"
OutFile "..\..\writtt-windows-amd64-installer.exe"
InstallDir "$LOCALAPPDATA\Programs\Writtt"
InstallDirRegKey HKCU "Software\Writtt" "InstallLocation"
RequestExecutionLevel user
SetCompressor /SOLID lzma

!define MUI_ABORTWARNING
!define MUI_ICON "icon.ico"
!define MUI_UNICON "icon.ico"
!define MUI_FINISHPAGE_RUN "$INSTDIR\Writtt.exe"
!define MUI_FINISHPAGE_RUN_TEXT "Abrir o Writtt agora"

!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH

!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES

!insertmacro MUI_LANGUAGE "PortugueseBR"
!insertmacro MUI_LANGUAGE "English"
!insertmacro MUI_LANGUAGE "Spanish"

Section "Writtt Desktop" SecMain
  SectionIn RO
  SetOutPath "$INSTDIR"

  ; Close running instance gracefully if possible before replacing binary
  nsExec::ExecToStack 'taskkill /IM Writtt.exe /F'
  Pop $0
  Pop $1

  File /oname=Writtt.exe "..\..\writtt-windows-amd64.exe"
  File "icon.ico"

  WriteUninstaller "$INSTDIR\Uninstall.exe"

  CreateDirectory "$SMPROGRAMS\Writtt"
  CreateShortcut "$SMPROGRAMS\Writtt\Writtt.lnk" "$INSTDIR\Writtt.exe" "" "$INSTDIR\icon.ico" 0
  CreateShortcut "$SMPROGRAMS\Writtt\Desinstalar Writtt.lnk" "$INSTDIR\Uninstall.exe" "" "$INSTDIR\icon.ico" 0
  CreateShortcut "$DESKTOP\Writtt.lnk" "$INSTDIR\Writtt.exe" "" "$INSTDIR\icon.ico" 0

  WriteRegStr HKCU "Software\Writtt" "InstallLocation" "$INSTDIR"
  WriteRegStr HKCU "${UNINSTALL_KEY}" "DisplayName" "${PRODUCT_NAME}"
  WriteRegStr HKCU "${UNINSTALL_KEY}" "DisplayVersion" "${PRODUCT_VERSION}"
  WriteRegStr HKCU "${UNINSTALL_KEY}" "Publisher" "${PRODUCT_PUBLISHER}"
  WriteRegStr HKCU "${UNINSTALL_KEY}" "URLInfoAbout" "${PRODUCT_WEB_SITE}"
  WriteRegStr HKCU "${UNINSTALL_KEY}" "DisplayIcon" "$INSTDIR\Writtt.exe"
  WriteRegStr HKCU "${UNINSTALL_KEY}" "InstallLocation" "$INSTDIR"
  WriteRegStr HKCU "${UNINSTALL_KEY}" "UninstallString" '"$INSTDIR\Uninstall.exe"'
  WriteRegDWORD HKCU "${UNINSTALL_KEY}" "NoModify" 1
  WriteRegDWORD HKCU "${UNINSTALL_KEY}" "NoRepair" 1

  ${GetSize} "$INSTDIR" "/S=0K" $0 $1 $2
  IntFmt $0 "0x%08X" $0
  WriteRegDWORD HKCU "${UNINSTALL_KEY}" "EstimatedSize" "$0"
SectionEnd

Section "Uninstall"
  nsExec::ExecToStack 'taskkill /IM Writtt.exe /F'
  Pop $0
  Pop $1

  Delete "$INSTDIR\Writtt.exe"
  Delete "$INSTDIR\icon.ico"
  Delete "$INSTDIR\Uninstall.exe"
  RMDir "$INSTDIR"

  Delete "$DESKTOP\Writtt.lnk"
  Delete "$SMPROGRAMS\Writtt\Writtt.lnk"
  Delete "$SMPROGRAMS\Writtt\Desinstalar Writtt.lnk"
  RMDir "$SMPROGRAMS\Writtt"

  DeleteRegKey HKCU "${UNINSTALL_KEY}"
  DeleteRegKey HKCU "Software\Writtt"
SectionEnd
