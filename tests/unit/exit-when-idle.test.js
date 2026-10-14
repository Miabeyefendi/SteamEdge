// "When all cards are collected: close the app" and its grace period.
// Run with `npm test` (tests/run.js).
const fs=require('fs'),vm=require('vm');
const src=fs.readFileSync(require('path').resolve(__dirname, '..', '..', 'main.js'),'utf8');
const fn=src.match(/let exitTimer = null;[\s\S]*?\n\}\n(?=function farmBroadcast)/)[0];
function run(label,{action,busy,pending}){
  const logs=[];let quit=0;let timers=[];
  const ctx={settings:{farmFinishedAction:action},accounts:new Map([[1,{}]]),accountRunning:()=>busy,log:(l,m)=>logs.push(m),
    app:{quit:()=>quit++},isQuitting:false,setTimeout:(f,ms)=>{timers.push([f,ms]);return 1;}};
  ctx.accounts.get(1).pendingFarm=pending;
  vm.createContext(ctx);vm.runInContext(fn+';this.go=scheduleExitWhenIdle;',ctx);
  ctx.go();ctx.go(); // second call must not double schedule
  const ms=timers[0][1];timers.forEach(t=>t[0]());
  console.log(label,'| timers:',timers.length,'delay:',ms,'| quit calls:',quit,'|',logs.join(' / '));
}
run('idle, exit      ',{action:'exit',busy:false,pending:null});
run('job still running',{action:'exit',busy:true,pending:null});
run('paused farm pend.',{action:'exit',busy:false,pending:{}});
run('setting turned off',{action:'none',busy:false,pending:null});
