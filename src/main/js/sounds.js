    // Notification sounds, synthesised with Web Audio (no sound files).
    // Loaded after common.js (main.html); like every page script it shares the global scope.

    // ================= NOTIFICATION SOUNDS =================
    // The sounds are PRODUCED with Web Audio, no file is downloaded: we cannot verify the
    // licence of downloaded sound files; synthesis creates no copyright issue and does not grow the app.
    //
    // There are two sound sources, which is why the tones do not resemble each other:
    //   'tone'  - oscillator. f is a number or a [start, ..., end] sweep array.
    //   'noise' - white noise + filter (percussive effects like whoosh / smash / hit come from this).
    // Shared fields: at=start s, d=duration s, g=volume, a=attack s, wave=wave shape.
    const NS = (o) => Object.assign({ t:'tone', at:0, d:.4, g:.2, a:.008, wave:'sine' }, o);
    const NZ = (o) => Object.assign({ t:'noise', at:0, d:.4, g:.2, a:.004, ftype:'bandpass', f:[800,800], q:1 }, o);
    // A small helper to repeat the same sound with a delay (an echo/double hit feel)
    const REP = (n, step, make) => Array.from({ length:n }, (_, i) => make(i * step, i));

    const NOTIF_SOUNDS = {
      // Five plain sounds of different lengths, none of them a melody (about 0.6 s to 1.5 s)
      hit:      { voices:[ NZ({d:.09,g:.34,a:.001,ftype:'lowpass',q:.7,f:[6000,900]}),
                           NS({f:[190,55],d:.55,g:.30,wave:'triangle'}),
                           NZ({at:.04,d:1.2,g:.09,a:.01,ftype:'bandpass',q:6,f:[2400,1600]}) ] },   // ringing tail
      knock:    { voices:[ ...REP(3,.21,(t)=>NS({f:[210,70],at:t,d:.26,g:.32,wave:'triangle'})),
                           ...REP(3,.21,(t)=>NZ({at:t,d:.05,g:.18,a:.001,ftype:'lowpass',f:[3000,600]})),
                           NZ({at:.42,d:.9,g:.06,a:.02,ftype:'lowpass',q:1,f:[900,200]}) ] },      // room echo
      thud:     { voices:[ NS({f:[110,38],d:1.1,g:.38,wave:'sine'}), NZ({d:.07,g:.14,a:.001,ftype:'lowpass',f:[1400,300]}) ] },
      drip:     { voices:[ NS({f:[420,1500],d:.14,g:.22}), NS({f:[380,1300],at:.55,d:.16,g:.18}),
                           NS({f:[440,1600],at:1.15,d:.9,g:.16}) ] },
      whoosh:   { voices:[ NZ({d:1.5,g:.30,a:.25,ftype:'bandpass',q:1.6,f:[240,1200,5200,2400,500]}) ] },
    };

    // Play the sound. Every call opens its own AudioContext and closes it when done (keeping a long lived
    // context in Electron created needless audio device occupancy).
    function playNotifSound(name){
      const kind = name || (typeof appSettings==='object' && appSettings && appSettings.notifSound) || 'knock';
      if (kind === 'none') return;
      const def = NOTIF_SOUNDS[kind] || NOTIF_SOUNDS.knock;
      try {
        const Ctx = window.AudioContext || window.webkitAudioContext;
        if (!Ctx) return;
        const ctx = new Ctx();
        const t0 = ctx.currentTime + 0.02;
        let end = 0;
        // Applies a parameter as a number or as a [a,b,c...] sweep array
        const ramp = (param, val, start, halt)=>{
          const pts = Array.isArray(val) ? val : [val];
          param.setValueAtTime(Math.max(1, pts[0]), start);
          for (let i=1; i<pts.length; i++){
            param.exponentialRampToValueAtTime(Math.max(1, pts[i]), start + halt*(i/(pts.length-1)));
          }
        };
        def.voices.forEach(v=>{
          const start = t0 + (v.at||0), halt = v.d;
          const g = ctx.createGain();
          const atk = Math.min(v.a || .008, halt*0.5);
          g.gain.setValueAtTime(0.0001, start);
          g.gain.exponentialRampToValueAtTime(v.g, start + atk);           // attack
          g.gain.exponentialRampToValueAtTime(0.0001, start + halt);        // decay
          let src;
          if (v.t === 'noise'){
            // White noise buffer - when passed through the filter the whoosh/smash/hit character comes out
            const len = Math.ceil(ctx.sampleRate * halt);
            const buf = ctx.createBuffer(1, len, ctx.sampleRate);
            const ch = buf.getChannelData(0);
            for (let i=0;i<len;i++) ch[i] = Math.random()*2 - 1;
            src = ctx.createBufferSource(); src.buffer = buf;
            const flt = ctx.createBiquadFilter();
            flt.type = v.ftype; flt.Q.value = v.q;
            ramp(flt.frequency, v.f, start, halt);
            src.connect(flt); flt.connect(g);
          } else {
            src = ctx.createOscillator();
            src.type = v.wave;
            ramp(src.frequency, v.f, start, halt);
            src.connect(g);
          }
          g.connect(ctx.destination);
          src.start(start); src.stop(start + halt + 0.02);
          end = Math.max(end, (v.at||0) + halt);
        });
        setTimeout(()=>{ try{ ctx.close(); }catch(_){} }, (end + 0.4) * 1000);
      } catch(_){}
    }
