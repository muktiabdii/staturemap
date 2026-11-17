import "dotenv/config";
import { prisma } from "../../src/lib/prisma";

async function main() {
  // TODO: seed initial Admin account and administrative region data
  console.log("Seed completed");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
