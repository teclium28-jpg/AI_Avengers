// Mutate disposable copies, never the working source. A survivor fails the run.
import { mkdtemp, cp, readFile, writeFile, rm } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { randomInt } from 'node:crypto';
const root=resolve('.'), seed=String(process.env.FAIRSHARE_SEED??randomInt(1,2147483647));
const mutants=[
 ['transport double count','reconciliation.ts','sums.dispatch - sums.receipt - sums.loss_transit - sums.return','sums.dispatch + sums.receipt - sums.loss_transit - sums.return'],
 ['center ignores collections','reconciliation.ts','sums.receipt - sums.collection - sums.loss_center - sums.return_center','sums.receipt - sums.loss_center - sums.return_center'],
 ['ignore cancelled originals','reconciliation.ts','!e.reversesEventId && !cancelled.has(e.id)','!e.reversesEventId'],
 ['skip fingerprint check','decision.ts','await fingerprint(record) !== expectedHash','false'],
 ['reverse stock objective','interventions.ts','a.addedStockKits <= b.addedStockKits','a.addedStockKits >= b.addedStockKits'],
 ['skip CSV neutralization','receipt-export.ts','text = "\'" + text','text = text'],
 ['skip HTML escaping','receipt-export.ts',"String(text).replace(/[&<>\"']/g",'String(text).replace(/NEVER_MATCH_THIS/g'],
];
let survivors=0;
for(const [name,file,before,after] of mutants){
 const dir=await mkdtemp(join(root,'.mutation-'));
 try{
  await cp(join(root,'packages/domain'),join(dir,'domain'),{recursive:true});
  const path=join(dir,'domain/src',file),original=await readFile(path,'utf8');
  if(!original.includes(before))throw new Error('Mutation anchor missing: '+name);
  await writeFile(path,original.replaceAll(before,after));
  const result=spawnSync(process.execPath,['--experimental-strip-types','--test',join(dir,'domain/test/decision-loop.test.ts')],{encoding:'utf8',env:{...process.env,FAIRSHARE_SEED:seed},timeout:30000,windowsHide:true});
  if(result.error)throw result.error;
  // A syntax/import failure is an invalid mutant, not evidence of detection.
  if(/SyntaxError|ERR_MODULE_NOT_FOUND/.test(result.stdout+result.stderr))throw new Error('Invalid mutant: '+name);
  const killed=result.status!==0;console.log(JSON.stringify({name,killed,seed}));if(!killed)survivors++;
 }finally{
  if(!dir.startsWith(root+'\\.mutation-')&&!dir.startsWith(root+'/.mutation-'))throw new Error('Unsafe cleanup path');
  await rm(dir,{recursive:true,force:true});
 }
}
if(survivors)throw new Error(`${survivors} mutation(s) survived`);
