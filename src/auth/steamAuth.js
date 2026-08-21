const { LoginSession, EAuthTokenPlatformType, EAuthSessionGuardType } = require('steam-session');
const QRCode = require('qrcode');
const fs = require('fs');
const path = require('path');

// All Steam authentication for the app. Runs in the MAIN process (renderer can't use node
// modules). Talks back to the renderer through `emit(event, data)` (main.js forwards over IPC).
//
// Key point: we authenticate as EAuthTokenPlatformType.SteamClient so the refresh token is
// valid for the Steam client / CM logon (headless idle). The old embedded web login produced a
// web-audience token that the CM rejects (InvalidPassword) - that path is intentionally gone.
class SteamAuth {
  constructor(configDir, emit) {
    this.configDir = configDir;
    this.emit = emit;
    this.session = null;
    this.result = null;          // { refreshToken, accountName, steamID, cookies }
    // Ayarlanırsa (main.js "Add Account" akışını başlatırken), yeni hesap kaydedilen listeye
    // eklenir ama aktif oturum (session.json) değiştirilmez - kullanıcı halihazırda kullandığı
    // hesapta kalmaya devam eder, yeni hesabı istediğinde hesap değiştiriciden seçer.
    this.addingAccount = false;
  }

  // ---- login: QR ----
  async startQR() {
    try {
      this._newSession();
      const r = await this.session.startWithQR();
      const image = await QRCode.toDataURL(r.qrChallengeUrl, { margin: 2, width: 220 });
      this.emit('qr', { image });
    } catch (e) { this.emit('error', { message: e.message }); }
  }

  // ---- login: username + password ----
  async startCredentials(accountName, password) {
    try {
      this._newSession();
      const r = await this.session.startWithCredentials({ accountName, password });
      if (r.actionRequired) {
        const acts = r.validActions || [];
        const codeAct = acts.find(a =>
          a.type === EAuthSessionGuardType.DeviceCode || a.type === EAuthSessionGuardType.EmailCode);
        if (codeAct) {
          this.emit('guard', { needCode: true, email: codeAct.type === EAuthSessionGuardType.EmailCode });
        } else {
          this.emit('status', { message: 'Steam mobil uygulamasından girişi onaylayın...' });
        }
      }
      // otherwise the 'authenticated' event fires on its own
    } catch (e) { this.emit('error', { message: e.message }); }
  }

  async submitGuard(code) {
    try { await this.session.submitSteamGuardCode(code); }
    catch (e) { this.emit('error', { message: 'Kod reddedildi: ' + e.message }); }
  }

  cancel() { if (this.session) { try { this.session.cancelLoginAttempt(); } catch (_) {} this.session = null; } }

  _newSession() {
    this.cancel();
    this.session = new LoginSession(EAuthTokenPlatformType.SteamClient);
    this.session.on('authenticated', () => this._onAuth());
    this.session.on('timeout', () => this.emit('error', { message: 'Oturum zaman aşımına uğradı, tekrar deneyin.' }));
    this.session.on('error', (e) => this.emit('error', { message: e.message }));
    this.session.on('remoteInteraction', () => this.emit('status', { message: 'QR tarandı - telefonda onay bekleniyor...' }));
  }

  async _onAuth() {
    const steamID = this.session.steamID ? this.session.steamID.getSteamID64() : null;
    let cookies = [];
    try { cookies = await this.session.getWebCookies(); } catch (_) {}
    this.result = {
      refreshToken: this.session.refreshToken,
      accountName: this.session.accountName,
      steamID,
      cookies,
    };
    this._saveSession();
    this.emit('authenticated', {
      accountName: this.result.accountName, steamID, hasCookies: cookies.length > 0,
    });
  }

  // ---- cookie login (web-only fallback: no headless idle) ----
  loginCookie(sessionid, steamLoginSecure, steamparental) {
    try {
      fs.mkdirSync(this.configDir, { recursive: true });
      fs.writeFileSync(path.join(this.configDir, 'web-session.json'),
        JSON.stringify({ sessionid, steamLoginSecure, steamparental: steamparental || '' }, null, 2));
      this.emit('authenticated', { webOnly: true });
    } catch (e) { this.emit('error', { message: e.message }); }
  }

  // ---- config helpers ----
  // Hesabı accounts.json listesine ekler/günceller (steamID ile eşleşir - yeniden giriş yenilenmiş
  // refreshToken'ı üzerine yazar). addingAccount açıkken aktif oturuma (session.json) dokunmaz;
  // kapalıyken (normal giriş) bu hesabı aynı zamanda aktif hesap yapar.
  _saveSession() {
    fs.mkdirSync(this.configDir, { recursive: true });
    const entry = { accountName: this.result.accountName, steamID: this.result.steamID, refreshToken: this.result.refreshToken };
    const accountsPath = path.join(this.configDir, 'accounts.json');
    let list = [];
    try { list = JSON.parse(fs.readFileSync(accountsPath, 'utf8')); if (!Array.isArray(list)) list = []; } catch (_) { list = []; }
    const idx = list.findIndex((a) => a.steamID === entry.steamID);
    if (idx >= 0) list[idx] = { ...list[idx], ...entry };
    else list.push({ ...entry, addedAt: Date.now() });
    fs.writeFileSync(accountsPath, JSON.stringify(list, null, 2));
    if (!this.addingAccount) {
      fs.writeFileSync(path.join(this.configDir, 'session.json'), JSON.stringify(entry, null, 2));
    }
  }
}

module.exports = SteamAuth;
