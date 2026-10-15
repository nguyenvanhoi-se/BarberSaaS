import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { build } from "esbuild";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";

const root=resolve(fileURLToPath(new URL("..",import.meta.url)));
async function loadTs(entry){
  const result=await build({entryPoints:[resolve(root,entry)],bundle:true,platform:"node",format:"cjs",write:false,target:"node22"});
  const module={exports:{}};new Function("module","exports",result.outputFiles[0].text)(module,module.exports);return module.exports;
}

class FakeStatement {
  constructor(db,sql){this.db=db;this.sql=sql;this.values=[];}
  bind(...values){this.values=values;return this;}
  async first(){if(this.sql.includes("FROM shops s WHERE s.id=?"))return this.db.shops.get(this.values[0])??null;return null;}
  async all(){if(this.sql.includes("FROM bookings b JOIN users")){assert.match(this.sql,/b\.status IN \('PENDING','CONFIRMED'\)/u);return {results:this.db.candidates.filter((row)=>row.status==="PENDING"||row.status==="CONFIRMED")};}if(this.sql.includes("FROM subscriptions sub JOIN shops"))return {results:this.db.expiring};return {results:[]};}
  async run(){
    if(this.sql.includes("INSERT INTO email_logs")){
      const key=this.values[6];if(this.db.logs.has(key))return {meta:{changes:0}};
      this.db.logs.set(key,{id:this.values[0],shop_id:this.values[1],user_id:this.values[2],recipient:this.values[3],recipient_hash:this.values[4],template:this.values[5],notification_key:key,status:"SENDING",provider:this.values[7],attempts:0});return {meta:{changes:1}};
    }
    if(this.sql.includes("UPDATE email_logs SET status=?")){
      const row=this.db.logs.get(this.values[5]);if(!row)return {meta:{changes:0}};Object.assign(row,{status:this.values[0],error_code:this.values[1],provider_message_id:this.values[2],attempts:this.values[3],sent_at:this.values[4]});return {meta:{changes:1}};
    }
    return {meta:{changes:1}};
  }
}
class FakeDb {
  constructor(){this.shops=new Map();this.logs=new Map();this.candidates=[];this.expiring=[];}
  prepare(sql){return new FakeStatement(this,sql);}
}
const outcomes=[];
async function test(name,run){try{await run();outcomes.push(`PASS ${name}`);}catch(error){outcomes.push(`FAIL ${name}: ${error instanceof Error?error.stack??error.message:String(error)}`);}}

const templates=await loadTs("src/server/notifications/email-templates.ts");
const {EmailService}=await loadTs("src/server/notifications/EmailService.ts");
const {NotificationService}=await loadTs("src/server/notifications/NotificationService.ts");
const booking={id:"booking-a",shop_id:"shop-a",booking_code:"BK-A",customer_id:"customer-a",customer_name:"<script>alert(1)</script>",customer_email:"customer@a.test",customer_phone:"0900",barber_id:"barber-a",barber_name:"Barber A",service_id:"service-a",service_name:"Cut & Style",duration_minutes:30,booking_date:"2026-10-09",start_time:"10:00",end_time:"10:30",total_price:150000,note:null,status:"PENDING",created_at:"2026-10-08T00:00:00Z",updated_at:"2026-10-08T00:00:00Z"};
const shop={id:"shop-a",name:"Shop A",slug:"shop-a",phone:"0900",email:"shop@example.test",address:"Street",logo_url:null,owner_email:"owner@example.test",owner_name:"Owner A",primary_domain:"barber-a.test",timezone:"Asia/Ho_Chi_Minh",booking_email_enabled:"true",owner_notification_enabled:"true",reminder_enabled:"true",payment_email_enabled:"true"};

await test("Email templates cover every supported event and escape user content",async()=>{
  const data={customerName:"<script>alert(1)</script>",shopName:"Shop A",bookingCode:"BK-A",serviceName:"Cut & Style",barberName:"Barber A",bookingDate:"2026-10-09",startTime:"10:00",endTime:"10:30",totalPrice:150000,currency:"VND",status:"PENDING",shopUrl:"https://shop-a.test",bookingUrl:"https://shop-a.test/my-bookings"};
  for(const template of ["booking_created","booking_confirmed","booking_cancelled","booking_completed","booking_reminder"]){const rendered=templates.renderEmail({template,data});assert.match(rendered.subject,/Shop A/u);assert.doesNotMatch(rendered.html,/<script>/u);assert.match(rendered.html,/&lt;script&gt;/u);assert.match(rendered.html,/https:\/\/shop-a\.test/u);}
  for(const input of [{template:"welcome",data:{customerName:"A",shopName:"Shop A",shopUrl:"https://shop-a.test"}},{template:"password_reset",data:{userName:"A",resetUrl:"https://shop-a.test/reset?token=one-time",expiresMinutes:15}},{template:"payment_success",data:{ownerName:"A",shopName:"Shop A",plan:"PRO",amount:10,currency:"VND",invoiceNumber:"INV-1",billingUrl:"https://shop-a.test/admin/billing"}},{template:"subscription_expiring",data:{ownerName:"A",shopName:"Shop A",plan:"PRO",expiresAt:"2026-10-10",daysRemaining:1,billingUrl:"https://shop-a.test/admin/billing"}},{template:"domain_failed",data:{ownerName:"A",shopName:"Shop A",hostname:"shop-a.test",domainsUrl:"https://shop-a.test/admin/settings/domains"}}])assert.ok(templates.renderEmail(input).subject.length>0);
});

await test("Clean SQLite migration chain parses and notification seeds/idempotency remain unique",async()=>{
  const db=new DatabaseSync(":memory:");
  try{
    const migrations=readdirSync(resolve(root,"migrations")).filter((name)=>/^\d+_.*\.sql$/u.test(name)).sort();
    for(const name of migrations)db.exec(readFileSync(resolve(root,"migrations",name),"utf8"));
    db.prepare("INSERT INTO shops(id,name,slug) VALUES(?,?,?)").run("migration-shop","Migration Shop","migration-shop");
    const phase15=readFileSync(resolve(root,"migrations","0014_notifications.sql"),"utf8");
    const seedSql=phase15.slice(phase15.indexOf("INSERT INTO shop_settings"));
    db.exec(seedSql);db.exec(seedSql);
    assert.equal(db.prepare("SELECT COUNT(*) AS count FROM shop_settings WHERE shop_id=? AND key IN ('booking_email_enabled','owner_notification_enabled','reminder_enabled','payment_email_enabled')").get("migration-shop").count,4);
    const insert=db.prepare("INSERT INTO email_logs(id,recipient,recipient_hash,template,notification_key,status,provider) VALUES(?,?,?,?,?,'SENDING',?) ON CONFLICT(notification_key) DO NOTHING");
    assert.equal(insert.run("log-1","a@example.test","hash","booking_created","same-event","none").changes,1);
    assert.equal(insert.run("log-2","a@example.test","hash","booking_created","same-event","none").changes,0);
    assert.equal(db.prepare("SELECT COUNT(*) AS count FROM email_logs WHERE notification_key=?").get("same-event").count,1);
  }finally{db.close();}
});

await test("Email provider disabled records NOT_CONFIGURED and never claims delivery",async()=>{
  const db=new FakeDb(),service=new EmailService({EMAIL_ENABLED:"false",EMAIL_PROVIDER:"none"},db);
  const result=await service.send({shopId:"shop-a",userId:"customer-a",recipient:"customer@a.test",notificationKey:"welcome:1",data:{template:"welcome",data:{customerName:"A",shopName:"Shop A",shopUrl:"https://shop-a.test"}}});
  assert.deepEqual(result,{status:"FAILED",errorCode:"NOT_CONFIGURED"});assert.equal([...db.logs.values()][0].status,"FAILED");assert.equal([...db.logs.values()][0].error_code,"NOT_CONFIGURED");
});

await test("Configured adapter retries transient errors at most three times and deduplicates events",async()=>{
  const db=new FakeDb();let calls=0;const provider={name:"test",checkConfiguration:()=>({configured:true,provider:"test",status:"READY"}),healthCheck:async()=>({configured:true,provider:"test",status:"READY"}),sendEmail:async()=>({providerMessageId:"ok"}),sendTemplate:async()=>{calls++;if(calls<3)throw {status:503};return {providerMessageId:"provider-1"};}};
  const service=new EmailService({EMAIL_ENABLED:"true",EMAIL_PROVIDER:"test",EMAIL_FROM:"noreply@example.test"},db,provider);const job={shopId:"shop-a",userId:"customer-a",recipient:"customer@a.test",notificationKey:"booking:1:confirmed",data:{template:"welcome",data:{customerName:"A",shopName:"Shop A",shopUrl:"https://shop-a.test"}}};
  assert.deepEqual(await service.send(job),{status:"SENT"});assert.equal(calls,3);assert.deepEqual(await service.send(job),{status:"DUPLICATE"});assert.equal(calls,3);assert.equal([...db.logs.values()][0].attempts,3);
});

await test("Booking events are tenant-aware, asynchronous, and owner alert is separate",async()=>{
  const db=new FakeDb();db.shops.set("shop-a",shop);const service=new NotificationService({EMAIL_ENABLED:"false",EMAIL_PROVIDER:"none",PLATFORM_DOMAIN:"mybarber.vn"},db,"test-request");const tasks=[];const execution={waitUntil:(task)=>tasks.push(task)};
  await service.bookingEvent("BOOKING_CREATED",booking,execution);await Promise.all(tasks);assert.equal(db.logs.size,2);assert.equal(db.logs.get("booking:booking-a:booking_created:customer").shop_id,"shop-a");assert.equal(db.logs.get("booking:booking-a:booking_created:owner").recipient,"owner@example.test");assert.equal(db.logs.get("booking:booking-a:booking_created:customer").status,"FAILED");
});

await test("Booking, payment, and domain event retries deduplicate and retain tenant recipients and URLs",async()=>{
  const db=new FakeDb();db.shops.set("shop-a",shop);db.shops.set("shop-b",{...shop,id:"shop-b",name:"Shop B",slug:"shop-b",owner_email:"owner@b.test",primary_domain:"barber-b.test"});
  const service=new NotificationService({EMAIL_ENABLED:"false",EMAIL_PROVIDER:"none",PLATFORM_DOMAIN:"mybarber.vn"},db,"event-test"),tasks=[];const execution={waitUntil:(task)=>tasks.push(task)};
  for(const event of ["BOOKING_CREATED","BOOKING_CONFIRMED","BOOKING_CANCELLED","BOOKING_COMPLETED"]){const item={...booking,status:event.replace("BOOKING_","")};await service.bookingEvent(event,item,execution);await service.bookingEvent(event,item,execution);}
  await service.paymentStatus("shop-a",{id:"payment-a",status:"PAID",amount:150000,currency:"VND",invoice_number:"INV-A",plan:"PRO"},execution);
  await service.paymentStatus("shop-a",{id:"payment-a",status:"PAID",amount:150000,currency:"VND",invoice_number:"INV-A",plan:"PRO"},execution);
  await service.paymentStatus("shop-a",{id:"payment-failed-a",status:"FAILED",amount:150000,currency:"VND",invoice_number:"INV-B",plan:"PRO"},execution);
  await service.paymentStatus("shop-a",{id:"payment-pending-a",status:"PENDING",amount:150000,currency:"VND",invoice_number:"INV-C",plan:"PRO"},execution);
  await service.domainStatus("shop-a","custom-a.test","ACTIVE",execution);await service.domainStatus("shop-a","custom-a.test","ACTIVE",execution);
  await service.domainStatus("shop-a","failed-a.test","FAILED",execution);await service.domainStatus("shop-a","failed-a.test","FAILED",execution);
  await Promise.all(tasks);
  assert.equal(db.logs.size,9);assert.ok([...db.logs.values()].every((row)=>row.shop_id==="shop-a"));
  assert.equal([...db.logs.values()].filter((row)=>row.recipient==="owner@b.test").length,0);
  assert.equal(db.logs.get("booking:booking-a:booking_created:customer").recipient,"customer@a.test");
  assert.ok([...db.logs.values()].every((row)=>!JSON.stringify(row).includes("shop-b.test")));
  assert.ok([...db.logs.keys()].some((key)=>key==="payment:payment-a:payment_success"));
  assert.ok(![...db.logs.keys()].some((key)=>key.includes("payment-pending-a")));
});

await test("Hourly reminder job is idempotent and uses configured tenant timezone",async()=>{
  const db=new FakeDb();db.shops.set("shop-a",shop);const now=new Date("2026-10-08T03:00:00Z");db.candidates=[{id:booking.id,shop_id:"shop-a",booking_code:booking.booking_code,customer_id:booking.customer_id,customer_name:booking.customer_name,customer_email:booking.customer_email,customer_phone:booking.customer_phone,barber_name:booking.barber_name,service_name:booking.service_name,duration_minutes:30,booking_date:"2026-10-09",start_time:"10:00",end_time:"10:30",total_price:150000,status:"PENDING"},{id:"cancelled-booking",shop_id:"shop-a",booking_code:"BK-C",customer_id:booking.customer_id,customer_name:"Customer",customer_email:"customer@a.test",customer_phone:null,barber_name:"Barber A",service_name:"Cut",duration_minutes:30,booking_date:"2026-10-09",start_time:"10:00",end_time:"10:30",total_price:150000,status:"CANCELLED"}];
  const service=new NotificationService({EMAIL_ENABLED:"false",EMAIL_PROVIDER:"none",REMINDER_HOURS_BEFORE:"24",SUBSCRIPTION_EXPIRATION_DAYS:"7,3,1"},db,"cron-test");await service.runScheduled(now);await service.runScheduled(now);assert.equal(db.logs.size,1);assert.ok(db.logs.has("booking:booking-a:booking_reminder:customer"));assert.ok(!db.logs.has("booking:cancelled-booking:booking_reminder:customer"));
});

await test("Subscription expiration and welcome events are tenant-scoped and idempotent",async()=>{
  const db=new FakeDb();db.shops.set("shop-a",shop);db.expiring=[{subscription_id:"sub-a",shop_id:"shop-a",plan:"PRO",expired_at:"2026-10-09T03:00:00.000Z",shop_name:"Shop A",slug:"shop-a",owner_email:"owner@example.test",owner_name:"Owner A",payment_email_enabled:"true"}];
  const service=new NotificationService({EMAIL_ENABLED:"false",EMAIL_PROVIDER:"none",SUBSCRIPTION_EXPIRATION_DAYS:"7,3,1"},db,"expiry-test"),tasks=[],execution={waitUntil:(task)=>tasks.push(task)};
  await service.welcome("shop-a",{id:"customer-a",name:"Customer A",email:"customer@a.test"},execution);
  await service.runScheduled(new Date("2026-10-08T03:00:00.000Z"));await service.runScheduled(new Date("2026-10-08T03:00:00.000Z"));await Promise.all(tasks);
  assert.equal(db.logs.size,2);assert.equal(db.logs.get("user:customer-a:welcome").recipient,"customer@a.test");assert.equal(db.logs.get("subscription:sub-a:expiring:1").recipient,"owner@example.test");assert.equal(db.logs.get("subscription:sub-a:expiring:1").shop_id,"shop-a");
});

console.log(outcomes.join("\n"));if(outcomes.some((line)=>line.startsWith("FAIL")))process.exitCode=1;
