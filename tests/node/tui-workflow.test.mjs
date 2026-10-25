import test from 'node:test';import assert from 'node:assert/strict';
test('workflow init uses only entered actor and selection and fixed plan mode',async()=>{const{runWorkflow}=await import('../../lib/tui/workflow.mjs');let payload;const menuAnswers=[0,0,null,null],textAnswers=['demo','entered-actor','user:selection','sha256:'+'b'.repeat(64)];const ui={menu:async()=>menuAnswers.shift(),text:async()=>textAnswers.shift(),page:async()=>{},review:async()=>true};await runWorkflow({ui,cwd:'/workspace',services:{listWorkflows:async()=>[],observeWorkspace:async()=>({realpath:'/workspace',head:'a'.repeat(40),branch:'main'}),prepareWorkflow:async options=>{payload=options;return options;},executeWorkflow:async()=>({code:3,decision:'hold',ruleIds:['cooperative.versions'],nextActions:[]})},onResult:r=>assert.equal(r.code,3)});assert.deepEqual(payload.input,{mode:'plan',actor:{id:'entered-actor'},selection:{messageRef:'user:selection',contentHash:'sha256:'+'b'.repeat(64)}});});

test('non-repository cwd can change workspace before workflow discovery',async()=>{
 const{runWorkflow}=await import('../../lib/tui/workflow.mjs');const screens=[],answers=[1,0,null,null];let listed;
 await runWorkflow({cwd:'/outside',ui:{menu:async(title,rows,options)=>{screens.push({title,rows,options});return answers.shift();},text:async()=>'/repository'},services:{observeWorkspace:async cwd=>{if(cwd==='/outside')throw Error('Not a Git repository');return{realpath:'/repository',branch:'main',head:'a'.repeat(40)};},listWorkflows:async cwd=>{listed=cwd;return[];}}});
 assert.equal(listed,'/repository');assert.ok(screens[0].rows.includes('Change workspace'));assert.ok(screens.some(s=>s.options?.info?.includes('Workspace: /repository')));
});

test('workflow text consumers preserve workspace ID and path Apply strings and Back null',async()=>{
 const{createTuiInterface}=await import('../../lib/tui/app.mjs');const{runWorkflow}=await import('../../lib/tui/workflow.mjs');
 const apply=async value=>createTuiInterface({viewport:()=>({columns:120,rows:40}),render:()=>({selectionEnabled:true}),nextEvent:(()=>{const events=[{name:'paste',text:value},{name:'enter'}];return async()=>events.shift();})()}).text('Input');
 const back=async()=>createTuiInterface({render:()=>({selectionEnabled:true}),nextEvent:(()=>{const events=[{name:'down'},{name:'text',text:'discard'},{name:'enter'}];return async()=>events.shift();})()}).text('Input','old');
 const menus=[1,0,0,1,1,null,null,null],inputs=[()=>apply('/repo'),()=>apply('workflow-id'),back,()=>apply('/payload.json')],observed=[],payloads=[];
 await runWorkflow({cwd:'/old',ui:{menu:async()=>menus.shift(),text:async()=>inputs.shift()(),review:async()=> 'apply',page:async()=>{}},services:{observeWorkspace:async cwd=>{observed.push(cwd);return{realpath:cwd,head:'a'.repeat(40),branch:'main'};},listWorkflows:async()=>[{id:'existing'}],prepareWorkflow:async options=>{payloads.push(options);return options;},executeWorkflow:async()=>({code:0,decision:'allow'})}});
 assert.deepEqual(observed,['/old','/repo','/repo'],'Back from Workflows re-observes the applied workspace before leaving');assert.equal(payloads.length,1);assert.deepEqual(payloads[0],{cwd:'/repo',workflowId:'existing',command:'record',input:undefined,jsonPath:'/payload.json'});assert.equal(inputs.length,0);
});
