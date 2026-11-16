import { PrismaClient } from "@prisma/client";
const db = new PrismaClient();
(async()=>{
  const c=await db.venture.count();
  console.log("ventures="+c);
  await db.$disconnect();
})().catch(e=>{console.error(e.message);process.exit(1)});
