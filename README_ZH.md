<div align="center">

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="./assets/logo-dark.svg">
  <img src="./assets/logo.svg" width="120" alt="SteamEdge">
</picture>

# SteamEdge

**不必開啟 Steam 客戶端，也能收集集換式卡牌、累積遊玩時數並管理成就。**

[![授權：AGPL v3](https://img.shields.io/badge/%E6%8E%88%E6%AC%8A-AGPL_v3-A78BFA?style=for-the-badge&logo=gnu&logoColor=white)](./LICENSE)
[![版本](https://img.shields.io/github/v/release/Miabeyefendi/SteamEdge?style=for-the-badge&color=F59E0B&label=%E7%89%88%E6%9C%AC)](https://github.com/Miabeyefendi/SteamEdge/releases/latest)
[![平台](https://img.shields.io/badge/Windows-1E293B?style=for-the-badge&logo=windows&logoColor=white)](#-安裝)
[![狀態](https://img.shields.io/badge/%E7%8B%80%E6%85%8B-%E7%B6%AD%E8%AD%B7%E4%B8%AD-22C55E?style=for-the-badge)](#)
[![作者](https://img.shields.io/badge/%E4%BD%9C%E8%80%85-Miabeyefendi-0EA5E9?style=for-the-badge&logo=github&logoColor=white)](https://github.com/Miabeyefendi)

[English](./README.md) · [Türkçe](./README_TR.md) · [Español](./README_ES.md) · **繁體中文** · [Русский](./README_RU.md)

[安裝](#-安裝) · [功能](#-功能重點) · [使用](#-快速開始) · [教學](./TUTORIAL_ZH.md) · [更新紀錄](./CHANGELOG.md)

<a href="https://github.com/Miabeyefendi/SteamEdge/releases/latest">
  <img src="./assets/btn-download.svg" height="52" alt="下載最新版本">
</a>
<a href="./TUTORIAL_ZH.md">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="./assets/btn-tutorial-dark.svg">
    <img src="./assets/btn-tutorial.svg" height="52" alt="閱讀教學">
  </picture>
</a>

</div>

---

## ✨ 功能重點

- **卡牌收集** - 讓遊戲顯示為「遊玩中」以掉落集換式卡牌。共五種模式，其中一種知道 Steam 必須等遊戲累積滿兩小時才會開始掉卡。
- **時數提升** - 同時最多開啟 32 款遊戲，並可選擇時數同步，把選定的遊戲拉到相同的總時數。
- **成就管理** - 直接從 Steam 協定讀取真實的鎖定與解鎖狀態，然後批次解鎖或重新鎖定。
- **擬真模式** - 保持單一遊戲開啟，並將成就由最常見到最稀有依序分散在整個時段解鎖，讓個人檔案看起來像真的玩過。
- **庫存與市集** - 真實成交紀錄、掛單簿、批次平均價與販售，全部以你的錢包貨幣顯示。
- **多帳號** - 多個帳號同時連線，各自在背景執行，切換時不會遺失進度。
- **不需要 Steam 客戶端** - 直接使用 Steam 自己的網路協定。客戶端從不啟動，也不需要。
- **免安裝** - 解壓縮即可執行。沒有安裝程式，不寫登錄檔，所有資料都放在執行檔旁邊。

---

## 📦 安裝

### 系統需求

| | |
|---|---|
| 作業系統 | Windows 10 以上，64 位元 |
| Steam 帳號 | 已設定 Steam 兩步驟驗證，手機或電子郵件皆可 |
| 磁碟空間 | 解壓縮後約 320 MB |
| Steam 客戶端 | 不需要，也不會使用 |

### 技術組成

![Electron](https://img.shields.io/badge/Electron-1E293B?style=for-the-badge&logo=electron&logoColor=A78BFA)
![Node.js](https://img.shields.io/badge/Node.js-1E293B?style=for-the-badge&logo=nodedotjs&logoColor=A78BFA)
![JavaScript](https://img.shields.io/badge/JavaScript-1E293B?style=for-the-badge&logo=javascript&logoColor=A78BFA)

### 安裝

```bash
git clone https://github.com/Miabeyefendi/SteamEdge.git
cd SteamEdge
npm install
```

<details>
<summary><b>改用發行版本安裝</b></summary>

1. 從[發行頁面](https://github.com/Miabeyefendi/SteamEdge/releases/latest)下載最新的 `.rar`。
2. 解壓縮到任意位置。請選擇你有權限的資料夾，不要放在 `Program Files`。
3. 執行 `SteamEdge.exe`。沒有任何安裝步驟，也不會在該資料夾之外寫入任何東西。

</details>

---

## 🚀 快速開始

```bash
npm start
```

首次啟動會出現登入畫面。用 Steam 手機應用程式掃描 QR 碼，或切換到密碼分頁輸入帳號密碼與 Steam 兩步驟驗證碼。除了執行檔旁 `settings/` 內的一組工作階段權杖之外，不會保存任何東西。

登入之後，「總覽」會顯示正在執行的工作與可用的功能。開啟**卡牌收集**，重新整理清單，選擇模式並按下開始。其餘的可以等你讀完[教學](./TUTORIAL_ZH.md)再說。

---

## ⚙️ 設定

一般設定存放在執行檔旁的 `settings/settings.json`，各帳號專屬資料則在 `settings/accounts/<steamID>.json`。全部都能在應用程式的「設定」頁面調整，沒有必要手動編輯檔案。

> **切勿分享 `settings/` 資料夾。** 裡面有你的 Steam 工作階段權杖，光憑它就足以使用你的帳號。

| 鍵值 | 預設 | 作用 |
|---|---|---|
| `boostMaxGames` | `32` | 時數提升同時開啟幾款遊戲 |
| `boostSync` | `false` | 把選定的遊戲拉到相同的總時數 |
| `fetchAvgWithPrice` | `true` | 取得價格時一併取得成交平均價 |
| `pauseFarmOnBoost` | `false` | 時數提升啟動時停止卡牌收集 |
| `sessionTimeout` | `never` | 閒置這麼多分鐘後中斷連線 |
| `uiLang` | `tr` | 介面語言：`tr`、`en`、`de`、`es`、`zh` |

所有鍵值都記載於[設定參考](./TUTORIAL_ZH.md#️-設定參考)。

---

## 📖 文件

- [**教學**](./TUTORIAL_ZH.md) - 每項功能、每個設定的完整說明
- [**更新紀錄**](./CHANGELOG.md) - 每個版本改了什麼
- [**參與貢獻**](./CONTRIBUTING.md) - 如何提交修改
- [**安全性**](./SECURITY.md) - 如何私下回報安全漏洞

---

## 🧭 開發計畫

- [ ] Steam 聊天整合。引擎已能接收訊息並自動回覆，缺的是介面。
- [ ] 俄文介面，與文件的語言一致。
- [ ] 其餘頁面依設計稿重建，一個版本一頁。
- [x] 擬真模式已依設計稿重建
- [x] 以物品為單位的市集佇列，價格與平均價一併取得

以上都不是承諾。這是個人專案，優先順序改變時這份清單也會跟著改。

---

## ❓ 常見問題

<details>
<summary><b>需要開著 Steam 客戶端嗎？</b></summary>

不需要。SteamEdge 直接使用 Steam 自己的網路協定。客戶端從不啟動，開著也不會有任何差別。

</details>

<details>
<summary><b>帳號會被封鎖嗎？</b></summary>

掛機遊戲與透過協定解鎖成就是許多工具都在做的事，Valve 從未公開表態。但這不代表安全。風險由你自行承擔。決定之前請先閱讀下方的免責聲明。

</details>

<details>
<summary><b>為什麼價格沒有換算成我的貨幣？</b></summary>

它本來就是。價格由 Steam 以你的錢包貨幣提供，並原封不動顯示。換算等於自行編造匯率，而編造的數字比沒有數字更糟。

</details>

<details>
<summary><b>某個成就解鎖不了，為什麼？</b></summary>

有些成就由遊戲伺服器寫入而非客戶端，Steam 不允許任何客戶端更動。SteamEdge 會從結構描述辨識這類成就並略過，而不是反覆嘗試失敗。另有少數遊戲根本不透過這個協定保存統計資料，此時你會看到 `0 / N`，這無法處理。

</details>

<details>
<summary><b>更新後無法運作，該怎麼辦？</b></summary>

請先看教學的[疑難排解](./TUTORIAL_ZH.md#-疑難排解)，再查看 `cache/steamedge.log` 紀錄檔。若仍無法運作，請開立問題回報並附上該紀錄檔。

</details>

---

## 🤝 參與貢獻

歡迎貢獻。請先閱讀 [CONTRIBUTING.md](./CONTRIBUTING.md) 與
[CODE_OF_CONDUCT.md](./CODE_OF_CONDUCT.md)。提交貢獻即表示你同意以 AGPL-3.0
授權你的作品。

<div align="center">
<a href="https://github.com/Miabeyefendi/SteamEdge/issues/new?template=bug_report.yml">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="./assets/btn-report-bug-dark.svg">
    <img src="./assets/btn-report-bug.svg" height="52" alt="回報問題">
  </picture>
</a>
<a href="https://github.com/Miabeyefendi/SteamEdge/stargazers">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="./assets/btn-star-dark.svg">
    <img src="./assets/btn-star.svg" height="52" alt="為這個儲存庫加星">
  </picture>
</a>
</div>

---

## 🛡️ 安全性

發現安全漏洞了嗎？請勿開立公開的問題回報，改依 [SECURITY.md](./SECURITY.md)
中的私下回報流程處理。

---

## 📜 授權

本專案採用 **GNU Affero 通用公共授權條款第 3 版（AGPL-3.0）**，並搭配
[NOTICE](./NOTICE) 檔案中的補充條款。摘要如下：

- 你可以免費使用、研究、修改、再散布本軟體，甚至用它獲利，**前提是**你必須
  依 AGPL-3.0 持續提供完整原始碼，包含任何託管、SaaS 或網路型態的使用
  （AGPL 第 13 條），並保留下方的作者標示。
- 若要將本作品用於閉源或專有產品，或作為封閉的 SaaS 營運，你需要**另行取得
  書面商業授權**，該授權可能包含權利金或營收分潤。詳見 [NOTICE](./NOTICE)
  第 8 節，並與我聯絡。

### 作者標示（必要）

依 AGPL-3.0 第 7(b) 條，下列標示必須在本專案的任何副本、分支或部署中，
以可見且未經修改的形式保留：

> **Miabeyefendi (Mustafa Ihsan Albayrak)** - https://github.com/Miabeyefendi

### 免責聲明

本軟體以「現狀」提供，不附任何形式的保證。你完全自行承擔執行風險，並須自行
負責一切使用行為，包括遵守本軟體所互動之任何第三方平台的服務條款。Valve 與
Steam 與作者並無隸屬關係，亦未為本專案背書；其名稱與商標屬於各自所有人。
在適用法律允許的最大範圍內，作者對帳號封鎖、資料遺失或任何其他損害概不負責。
完整條款請見 [LICENSE](./LICENSE) 與 [NOTICE](./NOTICE) 檔案。

---

## 📬 聯絡方式

- GitHub：[@miabeyefendi](https://github.com/Miabeyefendi)
- 商業授權或營收分潤事宜，請透過我的 GitHub 個人檔案與我聯絡。
