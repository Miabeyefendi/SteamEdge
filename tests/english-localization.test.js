const test = require('node:test');
const assert = require('node:assert/strict');
const translation = require('../src/core/ceviri');

translation.dilSec('en');

test('authentication and recovery messages are English', () => {
  assert.equal(translation.t('Steam mobil uygulamasından girişi onayla...'),
    'Approve the sign-in in the Steam mobile app...');
  assert.equal(translation.t('Oturum zaman aşımına uğradı, tekrar dene.'),
    'The sign-in timed out; try again.');
  assert.equal(translation.t('Kayıtlı hesaplar'), 'Saved accounts');
  assert.equal(translation.t('giriş başarılı, hazırlanıyor...'), 'signed in, preparing...');
});

test('messages missed by the original diacritic-only audit are English', () => {
  assert.equal(translation.t('Bu filtreye uyan oyun yok.'), 'No games match this filter.');
  assert.equal(translation.t('Envanter yenileniyor…'), 'Refreshing inventory…');
  assert.equal(translation.t('Ek Hesap 2'), 'Additional account 2');
});

test('saved activity messages from earlier versions display in English', () => {
  assert.equal(translation.t('1 öğe satışa sunuldu.'), '1 item listed.');
  assert.equal(translation.t('2 öğe satışa sunuldu.'), '2 items listed.');
  assert.equal(translation.t('0 öğe satışa sunuldu, 1 hata.'),
    'Items listed: 0; errors: 1.');
});
