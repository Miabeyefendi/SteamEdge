# 安裝

[English](../en/SETUP.md) · [Türkçe](../tr/SETUP.md) · [Deutsch](../de/SETUP.md) · [Español](../es/SETUP.md) · [繁體中文](../zh/SETUP.md)

讓 SteamEdge 跑起來大約需要兩分鐘。沒有安裝程式，也不會寫入任何 Windows 登錄檔。

---

## 1. 下載

前往 [Releases](https://github.com/Miabeyefendi/steamedge/releases/latest) 下載
`SteamEdge-vX.Y.Z-win-x64.rar`。

## 2. 解壓縮

在 zip 上按右鍵 →**解壓縮全部**。把資料夾放在你有寫入權限的位置：

- 建議：`桌面`、`文件`、`D:\Apps\SteamEdge`、隨身碟
- 避免：`C:\Program Files`（Windows 會阻擋寫入，設定將改存到 AppData 而非留在應用程式旁邊）

你會得到：

```
SteamEdge/
  SteamEdge.exe        應用程式
  settings/            首次執行時建立：設定、帳戶、工作階段、統計
  cache/               首次執行時建立：價格快取與記錄檔
  resources/           應用程式自有檔案，請勿更動
  README.txt           簡短使用說明
```

## 3. 首次啟動

按兩下 `SteamEdge.exe`。

Windows SmartScreen 可能顯示**「Windows 已保護您的電腦」**。這是因為執行檔沒有程式碼簽章，
簽章憑證每年要價數百美元，免費的業餘專案負擔不起。請點選**其他資訊 → 仍要執行**。

如果你不想信任來自陌生人的二進位檔，這完全合理：請改為[自行建置](#自行建置)。

## 4. 登入

你有兩個選擇。

### 方式 A：QR 碼（建議）

1. 在手機上開啟 **Steam 手機應用程式**。
2. 選單 →**Steam Guard** → QR 掃描圖示。
3. 掃描 SteamEdge 顯示的代碼。
4. 在手機上核准登入。

你的密碼完全不需要輸入，這是最安全的方式。

### 方式 B：使用者名稱與密碼

1. 輸入你的 Steam 使用者名稱與密碼。
2. 出現提示時輸入 Steam Guard 驗證碼（來自手機應用程式或電子郵件）。

你的密碼只用來取得一次權杖，且**不會被儲存**。實際儲存的是 Steam 核發的更新權杖，
保存在 `settings/session.json`。

> **請保護 `settings/` 資料夾。** 任何人複製它就能以你的身分登入。不要上傳、不要放進共用資料夾、
> 不要附加在問題回報中。

## 5. 選用：行動驗證器檔案（maFile）

登入後，SteamEdge 可以產生 maFile。有了它就能自動輸入 Steam Guard 驗證碼；
如果你希望批次市集上架不必逐一在手機上核准，這一點很重要。

你也可以略過。按下**略過（不使用 maFile 繼續）**，除了自動確認之外的功能都照常運作。

若你已從其他工具取得 maFile，請改用**匯入 maFile**。

## 6. 新增更多帳戶

SteamEdge 可同時farm多個帳戶。

1. 點選右上角頭像 →**新增帳戶**。
2. 用第二個帳戶登入（QR 或密碼）。
3. 兩個帳戶現在會在背景平行farm。

從同一個頭像選單可切換視窗顯示哪個帳戶。你在看其中一個時，其他帳戶仍持續運作。

## 你的資料在哪裡

| 路徑 | 內容 | 可以刪除嗎？ |
|---|---|---|
| `settings/settings.json` | 所有偏好設定 | 可以，會回復預設值 |
| `settings/session.json` | 你的登入權杖 | 可以，你會被登出 |
| `settings/accounts.json` | 已儲存的帳戶清單 | 可以，需要重新登入 |
| `settings/stats.json` | 累計統計 | 可以，僅遺失歷史紀錄 |
| `settings/state.json` | 佇列順序、成就紀錄 | 可以 |
| `cache/prices.json` | 市集價格快取 | 可以，價格會重新取得 |
| `cache/steamedge.log` | 診斷記錄 | 可以 |
| `cache/chromium/` | 介面快取 | 可以 |

**備份：** 設定 → 一般 → 備份 →**匯出**。會寫出單一 `.json`，內含你的偏好設定與統計。
登入權杖與已儲存帳戶刻意**不會**包含在內，因此該備份檔可以安心放在雲端。

## 移到另一台電腦

複製整個資料夾。你的設定、帳戶與工作階段都會跟著走。Steam 可能會要求你在手機上確認新裝置。

## 解除安裝

刪除資料夾即可。就這樣，沒有登錄檔項目，也沒有殘留在其他位置的檔案。

## 自行建置

如果你不想執行下載來的二進位檔：

```bash
git clone https://github.com/Miabeyefendi/steamedge.git
cd SteamEdge
npm install
npm start
```

需要 [Node.js](https://nodejs.org/) 20 或更新版本。要產生你自己的可攜版本：

```bash
npm run build
```

結果會出現在原始碼資料夾旁的 `../SteamEdge-vX.Y.Z-win-x64`。

---

下一步：[教學](./TUTORIAL.md) - farm 你的第一批卡牌。
