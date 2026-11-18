    // Realistic Mode settings panel: target and HowLongToBeat, pace, switches, dropdowns, simple/advanced and presets.
    // Loaded after realistic.js (main.html); like every page script it shares the global scope.

    // ---- target + HLTB calculations ----
    function grPaintAccount(){
      const game = grSel();
      grSet('grTcGameName', game ? game.name : '');
      grSet('grTcGameName2', game ? game.name : '');
      const durationMs = grDurationMs();
      const suitable = grPlan ? (grPlan.suitableTotal || 0) : 0;
      const auto = !!grVal('grTargetAuto', true);

      // with the games at the same time the target is the whole queue's
      grSet('grTargetTotal', String(grPlan && grPlan.parallel ? (grPlan.suitableQueue || suitable) : suitable));

      const crRaw = grVal('grCR', '2.0');
      const { tcHours: tc, difficultyValue: diff, manuallyEntered: manuallyEntered, playedHours: playtimeHours } = grTcAndDifficulty(game);

      // WHAT SHOULD ALREADY HAVE BEEN UNLOCKED at this playtime: the number a real player would have at this hour, minus the one really unlocked.
      // It is only used for the notes below. The target and the duration themselves come from the engine together with the plan (main.js planGames),
      // so the number in the box is the number that runs. (The page used to work out an automatic target of its own and send "all" to the engine.)
      const totalB = grPlan ? (grPlan.totalAchievements || 0) : 0;
      const unlockedB = grPlan ? (grPlan.unlockedState || 0) : 0;
      const denominator = Math.max(0.1, tc * diff);
      const scale = totalB || suitable;
      const expected = scale ? Math.min(scale, scale * (playtimeHours / denominator)) : 0;
      const remainingBehind = Math.max(0, Math.round(expected - unlockedB));
      const planned = grPlan ? (grPlan.totalSum || 0) : 0;
      // The two halves of the target box must look like ONE piece: the same font, the same height, the same colour.
      // It used to be a big white number on the top line and a small grey "/ total" under it.
      const goalColor = auto ? GRC.sub : GRC.title;
      grEl('grTarget').readOnly = auto;
      if (auto) grEl('grTarget').value = String(planned);
      ['grTarget', 'grTargetSep', 'grTargetTotal'].forEach((id)=>{
        const el = grEl(id); if (el) el.style.color = goalColor;
      });
      const goal = auto ? planned : Math.max(0, Math.min(grPlan && grPlan.parallel ? (grPlan.suitableQueue || suitable) : suitable, +grEl('grTarget').value || 0));
      grWritePlanSentence(grUnlockWindowMs(durationMs), (grPlan && grPlan.queueTotal) || goal || planned);

      // Backlog note
      const not = grEl('grCatchUpNote');
      if (not){
        const one = (grPlan && grPlan.accumulation) || 0;
        if (one > 0 && grVal('grCatchUp', true)){
          not.style.display = 'block';
          // a game played past its completion time: everything left is overdue and goes out at Steam's pace (realisticPlan.js FAST_GAP_MS), not over hours
          not.textContent = game && grPlan.finishedFlag
            ? tf('#: # saat oynanmış, bitiş süresini geçmiş. Kalan # başarımın hepsi geride kalmış sayılır ve saniyede bir açılır.', game.name, Math.round((game.playtimeMin||0)/60), grPlan.suitableTotal || one)
            : game
            ? tf('#: # saat oynanmış, # başarım geride kalmış. Geride kalanlar oturumun ilk beşte birinde açılır, sonrası normal ritimde sürer.', game.name, Math.round((game.playtimeMin||0)/60), one)
            : tf('# başarım geride kalmış; oturumun ilk beşte birinde açılır.', one);
        } else not.style.display = 'none';
      }

      // AUTO button and the border of the target box
      const ab = grEl('grAutoTarget');
      ab.style.borderColor = auto ? GRC.brandBd : '#2B3345';
      ab.style.background = auto ? '#151C28' : '#0D1118';
      ab.style.color = auto ? GRC.sub : GRC.muted;
      grEl('grTargetBox').style.borderColor = auto ? GRC.brandBd : '#2B3345';

      // Description in the simple panel
      const crLabel = { '1.5':'kısa hikâye oyunu', '2.0':'orta uzunlukta oyun', '2.5':'uzun açık dünya oyunu', '4.0':'bitmeyen sandbox oyunu', 'auto':'elle girilen süre' };
      const diffLabel = { '0.8':'kolay', '1.2':'normal', '2.0':'zor', '3.5':'çok zor' };
      // Make the number checkable: show which value it came from. The sentences are separate
      // templates: a single long concatenation came out fragmented and broken in every language.
      const tcSource = manuallyEntered ? t('girdiğin değer') : tf('# varsayımı', t(crLabel[crRaw] || 'tür tahmini'));
      grSet('grSimpleNote', game
        ? (tf('#: # saat oynanmış. Bitiş süresi # saat kabul edildi (#), zorluk: #.', game.name, Math.round(playtimeHours), Math.round(tc), tcSource, t(diffLabel[String(grVal('grDiff','1.2'))] || '-'))
           + ' ' + tf('Bu kadar oynanmışken # başarım açılmış olmalıydı; açılan #, geride kalan #.', Math.round(expected), unlockedB, remainingBehind)
           + ' ' + tf('# içinde # başarım açılır.', grDurationLabel(grUnlockWindowMs(durationMs)), goal))
        : t('Önce soldan bir oyun ekle.'));

      // Distribution model description
      const modelNote = {
        linear: 'Başarımlar süre boyunca eşit aralıklarla açılır. En sakin görünüm.',
        exp: 'Başta sık, sonra seyrek. Gerçek oyuncu da ilk saatlerde daha çok başarım alır.',
        pareto: 'Başarımların büyük kısmı sürenin ilk beşte birinde açılır. En hızlı, en dikkat çekici.',
      };
      grSet('grModelNote', modelNote[grVal('grModel','linear')] || '-');

      // The two Tc boxes (simple and advanced panel) show the same value.
      const tcValue = game ? grTcRead(game.appid) : 0;
      [grEl('grTcMain'), grEl('grTc')].forEach((el)=>{
        if (!el) return;
        el.placeholder = tc.toFixed(0);
        if (document.activeElement !== el) el.value = tcValue > 0 ? String(tcValue) : '';
      });
      grSet('grPlaytime', game ? durationUnit(localDecimal(playtimeHours, 1), 'sa') : '-');
      // the expected number was computed once above (the first part of the automatic target), it is not
      // recomputed here - so two different numbers do not show in two places.
      const expectedB = Math.round(expected);
      grSet('grExpected', totalB ? (expectedB + ' / ' + totalB) : '-');
      grSet('grPace', playtimeHours > 0 && expectedB ? localDecimal(expectedB / playtimeHours, 1) : '-');
      grSet('grLeft', grPlan ? String(suitable) : '-');
      // How long the remaining achievements will take to unlock in the real game (estimate)
      const remainingHours = (suitable && totalB) ? (suitable / totalB) * tc * diff : 0;
      grSet('grRemainEst', remainingHours ? (remainingHours < 1 ? durationUnit(Math.round(remainingHours*60), 'dk') : durationUnit(Math.round(remainingHours), 'sa')) : '-');
      grPaintSpeed();
    }

    // ---- pace settings (advanced panel) ----
    const GR_SPEED_FIELD = [
      ['grSpeed', 'grSpeed', 1, 0.1, 4],
      ['grUltraMultiplier', 'grUltraMultiplier', 3, 1, 10],
      ['grCatchUpShare', 'grCatchUpShare', 20, 2, 90],
      ['grFinishedRatio', 'grFinishedRatio', 50, 5, 100],
    ];
    function grPaintSpeed(){
      GR_SPEED_FIELD.forEach(([id, keyName, defaultVal])=>{
        const el = grEl(id);
        if (el && document.activeElement !== el) el.value = String(grVal(keyName, defaultVal));
      });
      const game = grSel();
      const not = grEl('grSpeedNote');
      if (!not) return;
      if (!game){ not.textContent = t('Önce soldan bir oyun ekle.'); return; }
      const { tcHours: tcHours, playedHours: playedHours } = grTcAndDifficulty(game);
      const isFinished = playedHours > 0 && playedHours >= tcHours;
      const frequent = +grVal('grFinishedRatio', 50) || 50;
      const autoSpan = !!grVal('grAutoDuration', true) && !grDurationTouched;
      not.textContent = (isFinished && autoSpan)
        ? tf('# zaten bitmiş sayılıyor (# saat oynanmış, bitiş # saat). Süre ayarlardan belirlendiği için sıkıştırma uygulanmaz.', game.name, Math.round(playedHours), Math.round(tcHours))
        : isFinished
        ? tf('# zaten bitmiş sayılıyor (# saat oynanmış, bitiş # saat). Çizelge %# oranına sıkıştırıldı.', game.name, Math.round(playedHours), Math.round(tcHours), frequent)
        : tf('Oyun henüz bitmemiş (# / # saat), sıkıştırma uygulanmıyor. Ultra nadir başarımlar # kat daha uzun bekler.', Math.round(playedHours), Math.round(tcHours), (+grVal('grUltraMultiplier', 3) || 3));
    }
    GR_SPEED_FIELD.forEach(([id, keyName, defaultVal, lower, upper])=>{
      const el = grEl(id); if (!el) return;
      el.addEventListener('change', async ()=>{
        const v = Math.max(lower, Math.min(upper, parseFloat(el.value) || defaultVal));
        el.value = String(v);
        await grSave({ [keyName]: v });
        grFetchPlan();          // the unlock times depend on these values
      });
    });

    // ---- switches (toggle) ----
    // The switches that are ON until the user turns them off. Painting and clicking used to disagree about two of them (grCatchUp, grAutoDuration):
    // the switch showed "on", and the first click wrote "on" again, so it seemed to do nothing.
    // grCatchUp is ON by default: if there is no backlog it changes nothing anyway.
    const grToggleDefault = (k) => k === 'grAuto' || k === 'grRandomGap' || k === 'grKeepHours' || k === 'grCatchUp' || k === 'grAutoDuration' || k === 'grParallel';
    function grPaintToggle(){
      document.querySelectorAll('#tab-realistic .gr-toggle').forEach(el=>{
        const k = el.getAttribute('data-grset');
        const on = !!grVal(k, grToggleDefault(k));
        el.style.background = on ? GRC.brand : '#151C28';
        el.style.borderColor = on ? GRC.brandBd : '#2B3345';
        const knob = el.firstElementChild;
        if (knob){ knob.style.background = on ? GRC.title : GRC.off; knob.style.marginLeft = on ? '16px' : '0px'; }
      });
    }
    document.querySelectorAll('#tab-realistic .gr-toggle').forEach(el=>{
      el.addEventListener('click', async ()=>{
        const k = el.getAttribute('data-grset');
        const newItem = !grVal(k, grToggleDefault(k));
        await grSave({ [k]: newItem });
        grPaintToggle();
        // Turning the automatic duration on again takes back a duration typed earlier in this session
        if (k === 'grAutoDuration' && newItem) grDurationTouched = false;
        if (k === 'grSkipUltraRare' || k === 'grAutoDuration' || k === 'grCatchUp' || k === 'grParallel') grFetchPlan();
        else grPaintList();
        grPaintAccount();
      });
    });

    // ---- dropdown lists ----
    function grPaintSelect(){
      const ancestor = (id, rawValue) => { const e = grEl(id); if (e) e.value = rawValue; };
      ancestor('grCR', grVal('grCR', '2.0'));
      ancestor('grCR2', grVal('grCR', '2.0'));
      ancestor('grDiff', grVal('grDiff', '1.2'));
      ancestor('grDiff2', grVal('grDiff', '1.2'));
      ancestor('grModel', grVal('grModel', 'linear'));
    }
    // We can change the same setting from both panels (the template does the same); the two stay in sync.
    [['grCR','grCR'], ['grCR2','grCR'], ['grDiff','grDiff'], ['grDiff2','grDiff'],
     ['grModel','grModel']].forEach(([id, keyName])=>{
      const e = grEl(id);
      if (!e) return;
      e.addEventListener('change', async ()=>{
        await grSave({ [keyName]: e.value });
        grPaintSelect();
        grFetchPlan();          // the type, the difficulty and the model all change the unlock times, so the plan is rebuilt
      });
    });
    // Both panels write the same value and the value is kept PER GAME. There used to be a single general
    // 'grTc' setting: writing 180 for Cyberpunk made every game in the library
    // count as 180 hours.
    ['grTcMain', 'grTc'].forEach((id)=>{
      const el = grEl(id); if (!el) return;
      el.addEventListener('change', async ()=>{
        const game = grSel();
        const hour = Math.max(0, Math.min(20000, parseFloat(el.value) || 0));
        el.value = hour > 0 ? String(hour) : '';
        if (game) await grTcWrite(game.appid, hour);
        else await grSave({ grTc: hour > 0 ? String(hour) : '' });
        grFetchPlan();       // the target and timing depend on this value, the plan is rebuilt
      });
    });
    ['grRH','grRM','grRS'].forEach(id=>{
      grEl(id).addEventListener('change', async ()=>{
        grDurationTouched = true;         // entered by hand, automatic assignment no longer overwrites it
        const ms = grDurationMs();
        grWriteDuration(ms);
        await grSave({ grDurationSec: Math.round(ms/1000) });
        grFetchPlan();
      });
    });
    grEl('grTarget').addEventListener('change', async ()=>{
      if (grVal('grTargetAuto', true)) return;
      await grSave({ grTarget: Math.max(0, +grEl('grTarget').value || 0) });
      grFetchPlan();
    });
    grEl('grAutoTarget').onclick = async ()=>{
      await grSave({ grTargetAuto: !grVal('grTargetAuto', true) });
      grPaintAccount();
      grFetchPlan();
    };

    // ---- simple / advanced ----
    function grPaintLevel(){
      const adv = grVal('grLevel', 'simple') === 'advanced';
      const s = grEl('grLvlSimple'), a = grEl('grLvlAdv');
      s.style.borderColor = adv ? 'transparent' : GRC.brandBd;
      s.style.background = adv ? 'transparent' : '#151C28';
      s.style.color = adv ? GRC.muted : GRC.title;
      a.style.borderColor = adv ? GRC.brandBd : 'transparent';
      a.style.background = adv ? '#151C28' : 'transparent';
      a.style.color = adv ? GRC.title : GRC.muted;
      grEl('grSimpleBox').style.display = adv ? 'none' : 'flex';
      grEl('grAdvBox').style.display = adv ? 'flex' : 'none';
    }
    grEl('grLvlSimple').onclick = async ()=>{ await grSave({ grLevel: 'simple' }); grPaintLevel(); };
    grEl('grLvlAdv').onclick = async ()=>{ await grSave({ grLevel: 'advanced' }); grPaintLevel(); };

    // ---- presets ----
    // The preset summary is built at draw time: the text written at save time stayed in the old language
    // when the language changed later. If old presets lack the field it falls back to the saved text.
    const GR_MODEL_NAME = { linear:'doğrusal', exp:'üstel (önden yüklemeli)', pareto:'Pareto (80/20)' };
    function grPresetMeta(p){
      if (!p || !p.spanSec || !Array.isArray(p.gameEntries)) return (p && p.meta) || '';
      return grDurationLabel(p.spanSec * 1000) + ' · ' + tf('# oyun', p.gameEntries.length) + ' · ' + t(GR_MODEL_NAME[p.model] || p.model || '-');
    }
    function grPaintPreset(){
      const box = grEl('grPresetsBox');
      box.style.display = grPresets.length ? 'block' : 'none';
      grEl('grPresets').innerHTML = grPresets.map((p,i)=>
        '<div data-grpreset="'+i+'" style="display:flex;align-items:center;gap:10px;padding:9px 0;border-bottom:1px solid #101621;cursor:pointer">'
        + '<span style="width:20px;height:20px;flex-shrink:0;border-radius:12px;border:1px solid #2B3345;background:#090C12;display:flex;align-items:center;justify-content:center;font-family:Geist Mono,monospace;font-size:12px;font-weight:700;color:#C2AAEE">'+(i+1)+'</span>'
        + '<div style="flex:1;min-width:0;display:flex;flex-direction:column;gap:2px">'
        + '<span style="font-size:12px;color:#B9C0D6;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">'+esc(p.heading||'-')+'</span>'
        + '<span style="font-family:Geist Mono,monospace;font-size:12px;color:#8B8F9E">'+esc(grPresetMeta(p))+'</span>'
        + '</div>'
        + '<button data-grpdel="'+i+'" class="h-stop" style="width:22px;height:22px;flex-shrink:0;border-radius:12px;border:1px solid #2B3345;background:#090C12;color:#8B8F9E;font-family:Geist Mono,monospace;font-size:14px;font-weight:700;line-height:1;cursor:pointer;display:flex;align-items:center;justify-content:center">&#8722;</button>'
        + '</div>').join('');
    }
    // At most this many presets are kept. If full, saving is REFUSED - silently dropping
    // the oldest would mean deleting a configuration without the user knowing.
    const GR_PRESET_LIMIT = 5;
    grEl('grSavePreset').onclick = async ()=>{
      if (!grQueue.length){ if (typeof toast === 'function') toast('Ön ayar').fail('Önce sıraya oyun ekle.'); return; }
      if (grPresets.length >= GR_PRESET_LIMIT){
        if (typeof toast === 'function') toast('Ön ayar').fail(tf('En fazla # ön ayar tutulur. Önce birini sil.', GR_PRESET_LIMIT));
        return;
      }
      const durationMs = grDurationMs();
      const p = {
        heading: grQueue.map(g=>g.name).join(', ').slice(0, 60),
        meta: '',
        gameEntries: grQueue.map(g=>g.appid),
        spanSec: Math.round(durationMs/1000),
        model: grVal('grModel','linear'),
        cr: grVal('grCR','2.0'), diff: grVal('grDiff','1.2'),
        goalAuto: !!grVal('grTargetAuto', true), goalValue: Math.max(0, +grEl('grTarget').value || 0),
        ts: Date.now(),
      };
      grPresets = [p].concat(grPresets).slice(0, GR_PRESET_LIMIT);
      await grSave({ grPresets });
      grPaintPreset();
      if (typeof toast === 'function') toast('Ön ayar').done('Kaydedildi.');
    };
    grEl('grPresets').addEventListener('click', async (e)=>{
      const remove = e.target.closest('[data-grpdel]');
      if (remove){
        grPresets.splice(+remove.getAttribute('data-grpdel'), 1);
        await grSave({ grPresets });
        grPaintPreset();
        return;
      }
      const row = e.target.closest('[data-grpreset]');
      if (!row) return;
      if (grStatus.runningFlag){ if (typeof toast === 'function') toast('Ön ayar').fail('Çalışırken ön ayar yüklenemez.'); return; }
      const p = grPresets[+row.getAttribute('data-grpreset')];
      if (!p) return;
      grQueue = (p.gameEntries||[]).map(id=>grGames.find(g=>g.appid===+id)).filter(Boolean);
      grWriteDuration((p.spanSec||7200)*1000);
      await grSave({
        grQueue: grQueue.map(g=>g.appid), grDurationSec: p.spanSec||7200, grModel: p.model||'linear',
        grCR: p.cr||'2.0', grDiff: p.diff||'1.2', grTargetAuto: p.goalAuto !== false, grTarget: p.goalValue||0,
      });
      grPaintSelect(); grPaintToggle(); grPaintLibrary();
      grEl('grTarget').value = String(p.goalValue||0);
      grFetchPlan();
      if (typeof toast === 'function') toast('Ön ayar').done('Yüklendi.');
    });
