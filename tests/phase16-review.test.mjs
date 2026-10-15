import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";
import { build } from "esbuild";

const root=resolve(fileURLToPath(new URL("..",import.meta.url)));
const compiled=await build({entryPoints:[resolve(root,"src/server/repositories/customer-review.repository.ts")],bundle:true,platform:"node",format:"cjs",write:false,target:"node22"});
const loaded={exports:{}};new Function("module","exports",compiled.outputFiles[0].text)(loaded,loaded.exports);
const {CustomerReviewRepository}=loaded.exports;

class Statement {
  constructor(db,sql){this.db=db;this.sql=sql;this.values=[];}
  bind(...values){this.values=values;return this;}
  async first(){return this.db.prepare(this.sql).get(...this.values)??null;}
  async run(){const result=this.db.prepare(this.sql).run(...this.values);return {meta:{changes:Number(result.changes)}};}
}
class D1Sqlite {
  constructor(db){this.db=db;}
  prepare(sql){return new Statement(this.db,sql);}
  async batch(statements){this.db.exec("BEGIN");try{const results=statements.map((statement)=>({meta:{changes:Number(this.db.prepare(statement.sql).run(...statement.values).changes)}}));this.db.exec("COMMIT");return results;}catch(error){this.db.exec("ROLLBACK");throw error;}}
}

const db=new DatabaseSync(":memory:");
try{
  db.exec("PRAGMA foreign_keys=ON");
  for(const name of readdirSync(resolve(root,"migrations")).filter((entry)=>/^\d+_.*\.sql$/u.test(entry)).sort())db.exec(readFileSync(resolve(root,"migrations",name),"utf8"));
  db.exec(`INSERT INTO shops(id,name,slug) VALUES('shop-a','Shop A','shop-a');
    INSERT INTO shops(id,name,slug) VALUES('shop-b','Shop B','shop-b');
    INSERT INTO users(id,shop_id,name,email,password_hash,role) VALUES('customer-a','shop-a','Customer A','a@example.test','test-hash','CUSTOMER');
    INSERT INTO users(id,shop_id,name,email,password_hash,role) VALUES('customer-b','shop-b','Customer B','b@example.test','test-hash','CUSTOMER');
    INSERT INTO barbers(id,shop_id,name) VALUES('barber-a','shop-a','Barber A');
    INSERT INTO barbers(id,shop_id,name) VALUES('barber-b','shop-b','Barber B');
    INSERT INTO services(id,shop_id,name,price,duration_minutes) VALUES('service-a','shop-a','Cut A',100,30);
    INSERT INTO services(id,shop_id,name,price,duration_minutes) VALUES('service-b','shop-b','Cut B',200,30);
    INSERT INTO bookings(id,shop_id,booking_code,customer_id,barber_id,service_id,booking_date,start_time,end_time,total_price,status) VALUES('booking-a','shop-a','BK-A','customer-a','barber-a','service-a','2026-10-01','10:00','10:30',100,'COMPLETED');
    INSERT INTO bookings(id,shop_id,booking_code,customer_id,barber_id,service_id,booking_date,start_time,end_time,total_price,status) VALUES('booking-b','shop-b','BK-B','customer-b','barber-b','service-b','2026-10-01','10:00','10:30',200,'COMPLETED');
    INSERT INTO bookings(id,shop_id,booking_code,customer_id,barber_id,service_id,booking_date,start_time,end_time,total_price,status) VALUES('booking-pending','shop-a','BK-P','customer-a','barber-a','service-a','2026-10-01','11:00','11:30',100,'PENDING');`);
  const repository=new CustomerReviewRepository(new D1Sqlite(db));
  const reviewId=await repository.createForCompletedBooking({shopId:"shop-a",customerId:"customer-a",bookingId:"booking-a",rating:5,comment:"Good cut"});
  assert.ok(reviewId);
  assert.equal((await repository.forCustomerBooking("shop-a","customer-a","booking-a")).status,"PENDING");
  assert.equal(await repository.createForCompletedBooking({shopId:"shop-a",customerId:"customer-a",bookingId:"booking-a",rating:5,comment:"Duplicate"}),null);
  assert.equal(await repository.createForCompletedBooking({shopId:"shop-a",customerId:"customer-a",bookingId:"booking-pending",rating:4,comment:null}),null);
  assert.equal(await repository.createForCompletedBooking({shopId:"shop-a",customerId:"customer-a",bookingId:"booking-b",rating:1,comment:"cross tenant"}),null);
  assert.equal(await repository.customerBookingState("shop-a","customer-a","booking-b"),null);
  assert.equal(db.prepare("SELECT COUNT(*) count FROM reviews").get().count,1);
  assert.equal(db.prepare("SELECT COUNT(*) count FROM audit_logs WHERE action='CREATE_REVIEW'").get().count,1);
  console.log("PASS customer review ownership, completion gate, duplicate protection, and audit log");
}finally{db.close();}
