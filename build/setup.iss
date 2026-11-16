; SteamEdge Setup. Built by build/installer.js: ISCC /DAppVersion=x /DSourceDir=<packaged folder> /DOutDir=<releases>
; The portable folder stays as it is. The Setup only wraps the same files.
; Data of an installed copy sits next to the exe like a portable copy (settings, cache, logs): the [Dirs] entries let normal users write there,
; and an update never touches them (see src/core/installMode.js).
#define AppName "SteamEdge"
#define Art SourcePath + "setup-art"
#ifndef AppVersion
  #error AppVersion is not defined
#endif
#ifndef LicenseText
  #define LicenseText SourcePath + "..\LICENSE"
#endif

[Setup]
AppId={{B7E3C1A2-5D4F-4E8A-9C61-2F0A7D3B5E94}
AppName={#AppName}
AppVersion={#AppVersion}
AppVerName={#AppName} {#AppVersion}
AppPublisher=Miabeyefendi
AppPublisherURL=https://github.com/Miabeyefendi/SteamEdge
AppSupportURL=https://github.com/Miabeyefendi/SteamEdge/issues
AppUpdatesURL=https://github.com/Miabeyefendi/SteamEdge/releases
VersionInfoVersion={#AppVersion}
DefaultDirName={autopf}\{#AppName}
DisableProgramGroupPage=yes
DisableDirPage=no
UsePreviousAppDir=yes
PrivilegesRequired=admin
PrivilegesRequiredOverridesAllowed=dialog
CloseApplications=yes
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
AppCopyright=Copyright (C) 2026 Mustafa Ihsan Albayrak (Miabeyefendi)
; The license page: the author notice (NOTICE) and the full license text, joined by build/installer.js
LicenseFile={#LicenseText}
SetupIconFile={#SourcePath}\..\src\assets\icon.ico
UninstallDisplayIcon={app}\{#AppName}.exe
OutputDir={#OutDir}
OutputBaseFilename=SteamEdge-Setup-v{#AppVersion}
Compression=lzma2/ultra64
SolidCompression=yes
; Follows the Windows app mode (light or dark). The images are drawn by build/make-setup-art.py from the app's own palette
WizardStyle=modern dynamic
WizardImageFile={#Art}\wizard-light-164x314.png,{#Art}\wizard-light-192x386.png,{#Art}\wizard-light-246x459.png,{#Art}\wizard-light-328x604.png
WizardImageFileDynamicDark={#Art}\wizard-dark-164x314.png,{#Art}\wizard-dark-192x386.png,{#Art}\wizard-dark-246x459.png,{#Art}\wizard-dark-328x604.png
WizardSmallImageFile={#Art}\small-55.png,{#Art}\small-64.png,{#Art}\small-83.png,{#Art}\small-110.png
WizardSmallImageFileDynamicDark={#Art}\small-55.png,{#Art}\small-64.png,{#Art}\small-83.png,{#Art}\small-110.png
WizardImageBackColor=#F7F4FD
WizardImageBackColorDynamicDark=#030305
ShowLanguageDialog=auto

[Languages]
Name: "en"; MessagesFile: "compiler:Default.isl"
Name: "tr"; MessagesFile: "compiler:Languages\Turkish.isl"
Name: "de"; MessagesFile: "compiler:Languages\German.isl"
Name: "es"; MessagesFile: "compiler:Languages\Spanish.isl"
Name: "zh"; MessagesFile: "compiler:Languages\ChineseTraditional.isl"
Name: "ru"; MessagesFile: "compiler:Languages\Russian.isl"

[CustomMessages]
en.DeleteData=Also delete your settings, accounts and saved sign-in of SteamEdge?
tr.DeleteData=SteamEdge ayarların, hesapların ve kayıtlı oturumun da silinsin mi?
de.DeleteData=Auch die Einstellungen, Konten und die gespeicherte Anmeldung von SteamEdge löschen?
es.DeleteData=¿Eliminar también los ajustes, las cuentas y el inicio de sesión guardado de SteamEdge?
zh.DeleteData=是否一併刪除 SteamEdge 的設定、帳號與已儲存的登入？
ru.DeleteData=Удалить также настройки, аккаунты и сохранённый вход SteamEdge?
en.LangTitle=Language of SteamEdge
en.LangSub=Which language should SteamEdge open in?
en.LangLabel=You can change it later in the settings.
tr.LangTitle=SteamEdge dili
tr.LangSub=SteamEdge hangi dilde açılsın?
tr.LangLabel=Daha sonra ayarlardan değiştirebilirsin.
de.LangTitle=Sprache von SteamEdge
de.LangSub=In welcher Sprache soll SteamEdge starten?
de.LangLabel=Du kannst sie später in den Einstellungen ändern.
es.LangTitle=Idioma de SteamEdge
es.LangSub=¿En qué idioma debe abrirse SteamEdge?
es.LangLabel=Puedes cambiarlo más tarde en los ajustes.
zh.LangTitle=SteamEdge 語言
zh.LangSub=SteamEdge 要以哪種語言開啟？
zh.LangLabel=之後可在設定中變更。
ru.LangTitle=Язык SteamEdge
ru.LangSub=На каком языке должен открываться SteamEdge?
ru.LangLabel=Позже его можно изменить в настройках.

[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"

[InstallDelete]
; A mixed folder (new exe, old resources or locales) stops Electron from starting: clear them before copying
Type: filesandordirs; Name: "{app}\resources"
Type: filesandordirs; Name: "{app}\locales"

[Dirs]
; Program Files is read-only for normal users: the data folders must be writable by them
Name: "{app}\settings"; Permissions: users-modify
Name: "{app}\cache"; Permissions: users-modify
Name: "{app}\logs"; Permissions: users-modify

[Files]
Source: "{#SourceDir}\*"; DestDir: "{app}"; Excludes: "settings\*,cache\*,logs\*"; Flags: recursesubdirs createallsubdirs ignoreversion

[Icons]
; The explicit AppUserModelID ties the taskbar button to this shortcut and its icon
Name: "{autoprograms}\{#AppName}"; Filename: "{app}\{#AppName}.exe"; AppUserModelID: "com.miabeyefendi.steamedge"
Name: "{autodesktop}\{#AppName}"; Filename: "{app}\{#AppName}.exe"; AppUserModelID: "com.miabeyefendi.steamedge"; Tasks: desktopicon

[Run]
Filename: "{app}\{#AppName}.exe"; Description: "{cm:LaunchProgram,{#AppName}}"; Flags: nowait postinstall skipifsilent runasoriginaluser
; An update started by the app runs silently: start the new version again
Filename: "{app}\{#AppName}.exe"; Flags: nowait runasoriginaluser; Check: WizardSilent

[UninstallDelete]
Type: files; Name: "{app}\setup-language.txt"

[Code]
var
  LangPage: TInputOptionWizardPage;

function CodeAt(I: Integer): String;
begin
  case I of
    0: Result := 'tr';
    1: Result := 'en';
    2: Result := 'de';
    3: Result := 'es';
    4: Result := 'zh';
    5: Result := 'ru';
  else
    Result := 'en';
  end;
end;

procedure InitializeWizard;
var
  I: Integer;
begin
  { After the folder page: the language the app opens in (the Setup's own language is chosen by Windows' language) }
  LangPage := CreateInputOptionPage(wpSelectDir, CustomMessage('LangTitle'), CustomMessage('LangSub'), CustomMessage('LangLabel'), True, False);
  LangPage.Add('Türkçe');
  LangPage.Add('English');
  LangPage.Add('Deutsch');
  LangPage.Add('Español');
  LangPage.Add('繁體中文');
  LangPage.Add('Русский');
  LangPage.SelectedValueIndex := 1;
  for I := 0 to 5 do
    if CodeAt(I) = ActiveLanguage then LangPage.SelectedValueIndex := I;
end;

procedure CurStepChanged(CurStep: TSetupStep);
var
  F: String;
begin
  { Only the first install decides: the app reads this file once, when it has no settings yet }
  if CurStep = ssPostInstall then
  begin
    F := ExpandConstant('{app}\setup-language.txt');
    if not FileExists(F) then SaveStringToFile(F, CodeAt(LangPage.SelectedValueIndex), False);
  end;
end;

procedure CurUninstallStepChanged(CurUninstallStep: TUninstallStep);
begin
  if (CurUninstallStep = usPostUninstall) and (not UninstallSilent) then
    if MsgBox(CustomMessage('DeleteData'), mbConfirmation, MB_YESNO or MB_DEFBUTTON2) = IDYES then
    begin
      DelTree(ExpandConstant('{app}\settings'), True, True, True);
      DelTree(ExpandConstant('{app}\cache'), True, True, True);
      DelTree(ExpandConstant('{app}\logs'), True, True, True);
    end;
end;
