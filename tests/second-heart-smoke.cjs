// Run inside a disposable Inkling test container, from /app.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { PrismaClient } = require('/app/node_modules/@prisma/client');
const sharp = require('/app/node_modules/sharp');
const prisma = new PrismaClient();
const base = 'http://127.0.0.1:3002/api';
let token;
async function api(path, method = 'GET', body) {
  const response = await fetch(base + path, {
    method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {})
  });
  assert.ok(response.ok, `${method} ${path}: ${response.status} ${response.ok ? '' : await response.text()}`);
  const result = await response.json();
  return result.data ?? result;
}
async function main() {
  token = (await api('/auth/login', 'POST', {pin: process.env.ADMIN_PIN})).token;
  const plugins = await api('/plugins');
  const plugin = plugins.find(p => p.slug === 'a_second_heart');
  assert.ok(plugin, 'Plugin was seeded');
  assert.equal(plugin.refreshInterval, 60);
  const instance = await api('/plugins/instances', 'POST', {pluginId:plugin.id, name:'Second Heart runtime test', settings:{timezone:'Asia/Kolkata'}});
  const route = `/plugins/instances/${instance.id}`;
  const data = await api(route + '/data');
  assert.ok(data.quote && data.title && data.author && data.highlight);
  assert.equal(data.before + data.highlight + data.after, data.quote);
  console.log('PASS: plugin seed, instance creation, timezone, credits, and highlight');
  // A cached quote from the previous minute must be refreshed even when <60 seconds old.
  await prisma.pluginInstance.update({where:{id:instance.id}, data:{lastFetchedAt:new Date(Math.floor(Date.now()/60000)*60000-1),lastData:{time:'STALE'}}});
  const fresh = await api(route + '/data');
  assert.notEqual(fresh.time, 'STALE');
  const expectedTime = new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Kolkata',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(new Date());
  assert.equal(fresh.time, expectedTime);
  console.log('PASS: previous-minute cache is refreshed immediately');
  await prisma.pluginInstance.update({where:{id:instance.id},data:{lastFetchedAt:new Date(),lastData:{...fresh,cache_marker:'same-minute'}}});
  assert.equal((await api(route+'/data')).cache_marker,'same-minute');
  console.log('PASS: same-minute cache is reused');
  for (const [width,height] of [[600,800],[1072,1448]]) {
    await api(route,'PUT',{settings:{timezone:'Asia/Kolkata',screen_width:width,screen_height:height}});
    const image = await fetch(base + route + '/render?layout=full&mode=preview');
    assert.ok(image.ok);
    const png = Buffer.from(await image.arrayBuffer());
    const meta = await sharp(png).metadata();
    assert.equal(meta.width,width); assert.equal(meta.height,height);
    const stats = await sharp(png).stats();
    assert.ok(stats.channels[0].stdev > 5, 'Rendered quote image contains visible content');
    fs.writeFileSync(`/app/uploads/second-heart-${width}x${height}.png`,png);
    const screen = await api('/screen-designs','POST',{name:`Second Heart ${width}x${height}`,width,height,widgets:[{templateId:20000+plugin.id,x:0,y:0,width,height,config:{type:'plugin',pluginId:plugin.id,pluginInstanceId:instance.id,layout:'full'}}]});
    const rendered = await api(`/screen-designs/${screen.id}/render`);
    const screenPng = Buffer.from(rendered.data,'base64');
    const screenMeta = await sharp(screenPng).metadata();
    assert.equal(screenMeta.width,width);assert.equal(screenMeta.height,height);
    assert.ok((await sharp(screenPng).stats()).channels[0].stdev > 5);
    fs.writeFileSync(`/app/uploads/second-heart-screen-${width}x${height}.png`,screenPng);
    console.log(`PASS: instance and saved screen render at ${width}x${height}`);
  }
}
main().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>prisma.$disconnect());
