
import "dotenv/config";
import { hash } from "argon2";
import { prisma } from "../../src/lib/prisma";

const SEED_PASSWORD = "StatureMapDev2026!";

const VILLAGES = {
  kemiri: "35.07.13.2001",
  sengguruh: "35.07.13.2002",
  mangunrejo: "35.07.13.2003",
} as const;

const users = [
  {
    name: "Admin StatureMap",
    email: "admin@staturemap.test",
    role: "ADMIN" as const,
    regionCode: null,
  },
  {
    name: "Nakes Kemiri",
    email: "nakes.kemiri@staturemap.test",
    role: "NAKES" as const,
    regionCode: VILLAGES.kemiri,
  },
  {
    name: "Nakes Sengguruh",
    email: "nakes.sengguruh@staturemap.test",
    role: "NAKES" as const,
    regionCode: VILLAGES.sengguruh,
  },
  {
    name: "Nakes Mangunrejo",
    email: "nakes.mangunrejo@staturemap.test",
    role: "NAKES" as const,
    regionCode: VILLAGES.mangunrejo,
  },
] as const;

const children = [
  {
    childId: "a1000000-0000-4000-8000-000000000001",
    name: "Anak Dummy Kemiri 1",
    ageMonths: 24,
    gender: "MALE" as const,
    heightCm: "82.00",
    classification: "STUNTED" as const,
    villageCode: VILLAGES.kemiri,
    userEmail: "nakes.kemiri@staturemap.test",
  },
  {
    childId: "a1000000-0000-4000-8000-000000000002",
    name: "Anak Dummy Kemiri 2",
    ageMonths: 36,
    gender: "FEMALE" as const,
    heightCm: "96.00",
    classification: "NORMAL" as const,
    villageCode: VILLAGES.kemiri,
    userEmail: "nakes.kemiri@staturemap.test",
  },
  {
    childId: "a1000000-0000-4000-8000-000000000003",
    name: "Anak Dummy Sengguruh 1",
    ageMonths: 18,
    gender: "MALE" as const,
    heightCm: "75.00",
    classification: "SEVERELY_STUNTED" as const,
    villageCode: VILLAGES.sengguruh,
    userEmail: "nakes.sengguruh@staturemap.test",
  },
  {
    childId: "a1000000-0000-4000-8000-000000000004",
    name: "Anak Dummy Sengguruh 2",
    ageMonths: 30,
    gender: "FEMALE" as const,
    heightCm: "90.00",
    classification: "NORMAL" as const,
    villageCode: VILLAGES.sengguruh,
    userEmail: "nakes.sengguruh@staturemap.test",
  },
  {
    childId: "a1000000-0000-4000-8000-000000000005",
    name: "Anak Dummy Mangunrejo 1",
    ageMonths: 12,
    gender: "MALE" as const,
    heightCm: "72.00",
    classification: "STUNTED" as const,
    villageCode: VILLAGES.mangunrejo,
    userEmail: "nakes.mangunrejo@staturemap.test",
  },
  {
    childId: "a1000000-0000-4000-8000-000000000006",
    name: "Anak Dummy Mangunrejo 2",
    ageMonths: 48,
    gender: "FEMALE" as const,
    heightCm: "105.00",
    classification: "TALL" as const,
    villageCode: VILLAGES.mangunrejo,
    userEmail: "nakes.mangunrejo@staturemap.test",
  },
] as const;

async function main() {
  const passwordHash = await hash(SEED_PASSWORD);

  // 1. Seed users
  for (const seedUser of users) {
    const workRegion = seedUser.regionCode
      ? await prisma.administrativeRegion.findUniqueOrThrow({
          where: { regionCode: seedUser.regionCode },
        })
      : null;

    await prisma.user.upsert({
      where: { email: seedUser.email },
      update: {
        name: seedUser.name,
        passwordHash,
        role: seedUser.role,
        accountStatus: "ACTIVE",
        workRegionId: workRegion?.id ?? null,
      },
      create: {
        name: seedUser.name,
        email: seedUser.email,
        passwordHash,
        role: seedUser.role,
        accountStatus: "ACTIVE",
        workRegionId: workRegion?.id ?? null,
      },
    });
  }

  console.log("Users seeded.");

  // 2. Seed children and screenings
  for (const seedChild of children) {
    const region = await prisma.administrativeRegion.findUniqueOrThrow({
      where: { regionCode: seedChild.villageCode },
    });

    const user = await prisma.user.findUniqueOrThrow({
      where: { email: seedChild.userEmail },
    });

    const screenedAt = new Date();
    const dateOfBirth = new Date(
      screenedAt.getFullYear(),
      screenedAt.getMonth() - seedChild.ageMonths,
      screenedAt.getDate(),
    );

    await prisma.child.upsert({
      where: { childId: seedChild.childId },
      update: {
        name: seedChild.name,
        dateOfBirth,
        gender: seedChild.gender,
        address: `Wilayah dummy ${region.regionName}`,
        assignedRegionId: region.id,
        createdByUserId: user.userId,
        updatedByUserId: user.userId,
        recordStatus: "ACTIVE",
      },
      create: {
        childId: seedChild.childId,
        name: seedChild.name,
        dateOfBirth,
        gender: seedChild.gender,
        address: `Wilayah dummy ${region.regionName}`,
        assignedRegionId: region.id,
        createdByUserId: user.userId,
        updatedByUserId: user.userId,
        recordStatus: "ACTIVE",
      },
    });

    const screeningId = `a2000000-0000-4000-8000-${seedChild.childId.slice(-12)}`;

    await prisma.screening.upsert({
      where: { screeningId },
      update: {
        childId: seedChild.childId,
        createdByUserId: user.userId,
        ageMonths: seedChild.ageMonths,
        gender: seedChild.gender,
        heightCm: seedChild.heightCm,
        classification: seedChild.classification,
        screenedAt,
        locationSource: "MANUAL",
        manualRegionId: region.id,
        resolvedRegionId: region.id,
        regionResolutionStatus: "RESOLVED",
      },
      create: {
        screeningId,
        childId: seedChild.childId,
        createdByUserId: user.userId,
        ageMonths: seedChild.ageMonths,
        gender: seedChild.gender,
        heightCm: seedChild.heightCm,
        classification: seedChild.classification,
        screenedAt,
        locationSource: "MANUAL",
        manualRegionId: region.id,
        resolvedRegionId: region.id,
        regionResolutionStatus: "RESOLVED",
      },
    });
  }

  console.log("Children and screenings seeded.");
  console.log("Seed completed.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
