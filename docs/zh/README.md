<div align="center">

<img src="../assets/social-preview.jpg" alt="SteamEdge - 收集 Steam 卡牌、提升遊玩時數、管理成就並在社群市集販售" width="860">

# SteamEdge

**farm Steam 集換式卡牌、提升遊玩時數、管理成就並在社群市集販售，全程不需執行 Steam 用戶端。**

[![授權：AGPL v3](https://img.shields.io/badge/License-AGPL_v3-blue.svg)](../../LICENSE)
[![版本](https://img.shields.io/github/v/release/Miabeyefendi/steamedge?label=%E4%B8%8B%E8%BC%89)](https://github.com/Miabeyefendi/steamedge/releases/latest)
[![下載次數](https://img.shields.io/github/downloads/Miabeyefendi/steamedge/total)](https://github.com/Miabeyefendi/steamedge/releases)
[![平台](https://img.shields.io/badge/platform-Windows-lightgrey.svg)](https://github.com/Miabeyefendi/steamedge/releases/latest)

[English](../../README.md) · [Türkçe](../tr/README.md) · [Deutsch](../de/README.md) · [Español](../es/README.md) · **繁體中文**

[下載](https://github.com/Miabeyefendi/steamedge/releases/latest) · [安裝](./SETUP.md) · [教學](./TUTORIAL.md) · [所有設定](./INSTRUCTIONS.md) · [常見問題](./FAQ.md)

</div>

---

## 這是什麼

SteamEdge 是一款透過 Steam 自有網路協定與 Steam 溝通的桌面應用程式。它以你的帳戶登入，將遊戲回報為
「遊玩中」，並收取 Steam 因此掉落的集換式卡牌。Steam 用戶端完全不需要開啟，不會下載或啟動任何遊戲，
也不會注入任何處理程序。

它同時能提升遊玩時數、解鎖或鎖定成就，並讀取真實的社群市集資料，讓你不必離開應用程式就能為卡牌定價與販售。

> **與 Valve Corporation 無任何隸屬關係。** Steam 與 Steam 標誌為 Valve 的商標。使用風險由你自行承擔，
> 請參閱[免責聲明](#免責聲明)。

## 功能

| | |
|---|---|
| **卡牌農場** | 五種模式：依序、卡牌最多、卡牌最少、自訂優先，以及理解 Steam 兩小時規則的快速模式。 |
| **多帳戶** | 可同時登入多個帳戶。它們在背景平行farm；視窗顯示你切換到的那一個。 |
| **時數提升** | 同時保持最多 32 款遊戲開啟。選用的**時數同步**可將不同時數分階段拉齊。 |
| **成就** | 透過協定讀取真實解鎖狀態，可批次解鎖或鎖定，具備安全模式與隨機間隔。 |
| **庫存與市集** | 真實掛單簿（目前掛單 + 收購訂單）與真實成交紀錄。物品價值來自**已成交的販售**，絕不採用單一哄抬掛單。 |
| **免 Steam 用戶端** | 一切透過 Steam 網路協定運作。沒有遊戲檔案、沒有覆疊、沒有注入。 |
| **可攜式** | 解壓縮即可執行。設定與快取就在執行檔旁邊，不會寫入登錄檔。 |
| **5 種語言** | English、Türkçe、Deutsch、Español、繁體中文。 |

## 快速開始

1. 從 [Releases](https://github.com/Miabeyefendi/steamedge/releases/latest) 下載最新的
   `SteamEdge-vX.Y.Z-win-x64.rar`。
2. 解壓縮到你有寫入權限的位置（桌面、隨身碟，任何地方皆可）。
3. 執行 `SteamEdge.exe`。
4. 用 Steam 手機應用程式掃描 QR 碼，或以使用者名稱與密碼登入。
5. 開啟**卡牌掉落**分頁並按下**開始**。

含圖片的完整說明：[安裝](./SETUP.md)。

## 比較

| | SteamEdge | Idle Master | ArchiSteamFarm |
|---|---|---|---|
| 需要 Steam 用戶端 | 否 | 是 | 否 |
| 同時多帳戶 | 是 | 否 | 是 |
| 圖形介面 | 是 | 是 | 網頁介面 |
| 時數提升 | 是 | 否 | 否 |
| 成就管理 | 是 | 否 | 否 |
| 內建市集販售 | 是 | 否 | 否 |
| 可攜（免安裝） | 是 | 是 | 是 |

此表比較的是範圍，而非品質。ArchiSteamFarm 是成熟得多的專案，若要大規模、無介面、多帳戶farm，它才是更好的
選擇。SteamEdge 針對的是想在單一視窗裡完成卡牌、時數、成就與販售的單機桌面使用者。

## 運作原理

Steam 只有在遊戲的總遊玩時數超過 **2 小時**之後才會掉落卡牌。SteamEdge 送出與真實 Steam 用戶端相同的
`ClientGamesPlayed` 訊息，因此 Steam 會照常計時並掉落卡牌。

- **快速模式**會先把每款低於 2 小時的遊戲拉到門檻，而且是平行進行的，因為 Steam 會為每個同時開啟的遊戲
  累積時數；接著讓它們全部保持開啟，每 1.5 至 2 分鐘輪換一次凸顯的遊戲。
- **物品價值**是 Steam 價格歷史中*已成交販售*的數量加權中位數。目前掛單會另外顯示，且永遠不會計入價值，
  因為單一賣家把物品掛到 999,999 美元不該影響它。
- **價格以你自己的錢包貨幣取得**，讀自 Steam 社群市集，並完全以該貨幣顯示。任何環節都沒有換算。

## 系統需求

- Windows 10 或 11，64 位元
- 一個 Steam 帳戶（建議啟用 Steam Guard 行動驗證器）
- 網際網路連線

其餘一概不需要。不需要 .NET、不需要 Node.js、不需要 Steam 用戶端。

## 從原始碼建置

```bash
git clone https://github.com/Miabeyefendi/steamedge.git
cd SteamEdge
npm install
npm start          # 以開發模式執行
npm run build      # 在 ../SteamEdge-vX.Y.Z-win-x64 產生可攜版本
```

需要 Node.js 20 或更新版本。詳見 [CONTRIBUTING.md](../../CONTRIBUTING.md)。

## 文件

| 指南 | 內容 |
|---|---|
| [安裝](./SETUP.md) | 下載、首次啟動、登入、新增更多帳戶 |
| [教學](./TUTORIAL.md) | farm 第一批卡牌、提升時數、販售物品 |
| [設定](./INSTRUCTIONS.md) | 每項設定的作用與建議值 |
| [常見問題](./FAQ.md) | 封鎖、安全性、請求限制、疑難排解 |

## 安全嗎？

決定之前請先閱讀 [FAQ.md](./FAQ.md)。簡短版本：

- SteamEdge 只送出官方 Steam 用戶端也會送出的訊息。它不修改遊戲檔案、不使用 Steam Web API 金鑰，
  也不會影響其他玩家。
- 你的密碼絕不會被儲存。Steam 會核發一組更新權杖，該權杖保存在執行檔旁的 `settings/` 中。
  請把該資料夾當作密碼看待。
- 在數秒內解鎖數百個成就會顯示在你的公開個人檔案上。安全模式存在是有原因的，請保持開啟。
- 將帳戶自動化違反 Steam 訂閱者協議。沒有人能保證你不會被處置，這個風險由你自行承擔。

## 參與貢獻

歡迎回報問題、提供翻譯與提交 Pull Request。請先閱讀
[CONTRIBUTING.md](../../CONTRIBUTING.md) 與[行為準則](../../CODE_OF_CONDUCT.md)。
若為安全性問題，請依循 [SECURITY.md](../../SECURITY.md)，不要開立公開 issue。

## 致謝

SteamEdge 是從零開始撰寫的獨立應用程式。以下專案**未取用任何程式碼**；我們研究每一個專案以了解 Steam
的運作方式，它們解決的問題與採取的做法給了我們啟發。

| 專案 | 我們學到什麼 | 作者 |
|---|---|---|
| [Idle Master](https://github.com/jshackles/idle_master) | 核心概念：不必開啟 Steam 用戶端，只要把遊戲回報為「遊玩中」就能farm卡牌。 | [@jshackles](https://github.com/jshackles) |
| [Idle Master Extended](https://github.com/JonasNilson/idle_master_extended) | 原專案封存後 Steam 端有哪些改變，以及哪些設定值得提供給使用者。 | [@JonasNilson](https://github.com/JonasNilson) |
| [HourBoostr](https://github.com/ezzpify/HourBoostr) | 可以同時開啟多款遊戲，以及這對時數累積的意義。 | [@ezzpify](https://github.com/ezzpify) |
| [Steam Achievement Manager](https://github.com/gibbed/SteamAchievementManager) | 不啟動遊戲也能讀取與修改成就。 | [@gibbed](https://github.com/gibbed) |
| [ArchiSteamFarm](https://github.com/JustArchiNET/ArchiSteamFarm) | 如何維持長時間執行的無介面 Steam 工作階段、maFile 的使用，以及同時執行多帳戶。 | [@JustArchi](https://github.com/JustArchi) |

應用程式中與 Steam 溝通的部分使用了 [@DoctorMcKay](https://github.com/DoctorMcKay) 及貢獻者的開放原始碼
套件 [steam-user](https://github.com/DoctorMcKay/node-steam-user)、
[steam-session](https://github.com/DoctorMcKay/node-steam-session)、
[steam-totp](https://github.com/DoctorMcKay/node-steam-totp) 與
[qrcode](https://github.com/soldair/node-qrcode)。其餘所有程式碼皆屬於 SteamEdge。

## 授權

本專案採用 **GNU Affero 通用公共授權條款第 3 版（AGPL-3.0）**，並搭配
[LICENSE](../../LICENSE) 檔案中的補充條款。簡而言之：

- 你可以免費使用、研究、修改、再散布本軟體，甚至藉此獲利，**前提是**你必須在 AGPL-3.0 之下持續提供完整
  原始碼（包含任何託管／SaaS／網路使用情形，見 AGPL 第 13 條），並保留下方的作者標示。
- 若要用於封閉原始碼或專有產品，或以封閉式 SaaS 形式運作，你需要**另行取得書面商業授權**
  （可能包含權利金／營收分潤）。請參閱 [LICENSE](../../LICENSE) 第 8 節並與我聯繫。

### 作者標示（必要）

依據 AGPL-3.0 第 7(b) 條，下列標示必須在本專案的任何副本、分支與部署中，以可見且未經修改的方式保留：

> **Miabeyefendi (Mustafa Ihsan Albayrak)** - https://github.com/Miabeyefendi

請參閱 [NOTICE](../../NOTICE) 檔案。

## 免責聲明

本軟體以「現狀」提供，不附任何形式的擔保。你完全自行承擔執行風險，並須自行負責使用行為，
包含遵守 Steam 訂閱者協議。Valve Corporation 與本專案並無隸屬關係，亦未加以背書；Steam 及相關標誌
屬於其各自所有者。在適用法律允許的最大範圍內，作者對帳戶封鎖、資料遺失或任何其他損害概不負責。
完整條款請見 [LICENSE](../../LICENSE)。

## 聯絡

- GitHub：[@miabeyefendi](https://github.com/Miabeyefendi)
- 商業授權或營收分潤事宜，請透過我的 GitHub 個人檔案與我聯繫。

---

<div align="center">
<sub>由 <a href="https://github.com/Miabeyefendi">Miabeyefendi</a> 開發 · AGPL-3.0-or-later</sub>
</div>
