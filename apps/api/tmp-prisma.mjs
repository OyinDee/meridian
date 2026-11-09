import { PrismaClient } from "@prisma\client";
const p = new PrismaClient({ log: [{ emit: "event", level: "query" }] });
p.$on("query", (e) => console.log("SQL:", e.query, "| PARAMS:", e.params));
try {
  const a = await p.account.create({ data: {
    accountNumber: "9999999999", ledgerCode: "9999999999", type: "INTERNAL",
    normalBalance: "DEBIT", currency: "NGN", nickname: "tmp", updatedAt: new Date()
  }, select: { id: true, accountNumber: true } });
  console.log("OK", a);
  await p.account.delete({ where: { accountNumber: "9999999999" } });
} catch (e) { console.error("FAIL", e.message); }
await p.$disconnect();
