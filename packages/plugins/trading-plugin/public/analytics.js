(function(){
'use strict';
var KEY=window.__POSTHOG_KEY__||((document.querySelector('meta[name="posthog-key"]')||{}).content)||'';
var HOST=window.__POSTHOG_HOST__||((document.querySelector('meta[name="posthog-host"]')||{}).content)||'https://us.i.posthog.com';
var queue=[],BATCH=10;
var did=localStorage.getItem('traider_did')||('anon_'+Math.random().toString(36).substr(2,12));
localStorage.setItem('traider_did',did);
function send(b){if(!KEY){b.forEach(function(e){console.log('[Analytics]',e.event)});return}
var p=JSON.stringify({api_key:KEY,batch:b});
if(navigator.sendBeacon)navigator.sendBeacon(HOST+'/batch',new Blob([p],{type:'application/json'}));
else{var x=new XMLHttpRequest();x.open('POST',HOST+'/batch',true);x.setRequestHeader('Content-Type','application/json');x.send(p)}}
function flush(){if(!queue.length)return;send(queue.splice(0,BATCH))}
setInterval(flush,30000);window.addEventListener('beforeunload',flush);
window.traiderAnalytics={
identify:function(id,p){did=id;localStorage.setItem('traider_did',id);
queue.push({event:'$identify',distinct_id:id,properties:{$set:Object.assign({},p,{$lib:'traider-client'})},timestamp:new Date().toISOString()});if(queue.length>=BATCH)flush()},
track:function(e,p){queue.push({event:e,distinct_id:did,properties:Object.assign({},p||{},{$lib:'traider-client',$current_url:location.href}),timestamp:new Date().toISOString()});if(queue.length>=BATCH)flush()},
page:function(p){this.track('$pageview',Object.assign({$current_url:location.href,$title:document.title,$referrer:document.referrer},p))},
flush:flush};
if(document.readyState==='complete')window.traiderAnalytics.page();
else window.addEventListener('load',function(){window.traiderAnalytics.page()});
})();