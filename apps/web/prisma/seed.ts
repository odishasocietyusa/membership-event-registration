import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

const chapters = [
  { id: 'canada',         displayName: 'Canada Chapter',        states: ['Canada'] },
  { id: 'carolinas',      displayName: 'Carolinas Chapter',      states: ['NC', 'SC'] },
  { id: 'california',     displayName: 'California Chapter',     states: ['CA'] },
  { id: 'chicago',        displayName: 'Chicago Chapter',        states: ['IL'] },
  { id: 'florida',        displayName: 'Florida Chapter',        states: ['FL'] },
  { id: 'georgia',        displayName: 'Georgia Chapter',        states: ['GA'] },
  { id: 'michigan',       displayName: 'Michigan Chapter',       states: ['MI'] },
  { id: 'minnesota',      displayName: 'Minnesota Chapter',      states: ['MN'] },
  { id: 'mt-hood',        displayName: 'Mt Hood Chapter',        states: ['OR'] },
  { id: 'new-england',    displayName: 'New England Chapter',    states: ['MA', 'CT', 'RI', 'ME', 'NH', 'VT'] },
  { id: 'ny-nj-pa',       displayName: 'NY-NJ-PA Chapter',       states: ['NY', 'NJ', 'PA'] },
  { id: 'ohio',           displayName: 'Ohio Chapter',           states: ['OH'] },
  { id: 'ozark',          displayName: 'Ozark Chapter',          states: ['KS', 'IA', 'MO'] },
  { id: 'rocky-mountain', displayName: 'Rocky Mountain Chapter', states: ['CO', 'MT', 'WY', 'ND', 'SD'] },
  { id: 'seattle',        displayName: 'Seattle Chapter',        states: ['WA'] },
  { id: 'southern',       displayName: 'Southern Chapter',       states: ['TN', 'LA', 'MS', 'AL'] },
  { id: 'southwest',      displayName: 'Southwest Chapter',      states: ['TX', 'AR', 'NM', 'OK'] },
  { id: 'washington-dc',  displayName: 'Washington DC Chapter',  states: ['MD', 'DC', 'VA', 'WV', 'DE'] },
]

const awardNames = [
  { id: 'community-service',    displayName: 'Community Service Award' },
  { id: 'lifetime-achievement', displayName: 'Lifetime Achievement Award' },
  { id: 'youth-excellence',     displayName: 'Youth Excellence Award' },
  { id: 'cultural-ambassador',  displayName: 'Cultural Ambassador Award' },
]

const membershipFees = [
  { id: 'annual-student-no-vote', membershipType: 'annualStudentNoVote' as const, amountDollars: 20,   isUpgradePath: true,  isAdminOnly: false },
  { id: 'annual-single',          membershipType: 'annualSingle'        as const, amountDollars: 25,   isUpgradePath: true,  isAdminOnly: false },
  { id: 'annual-family',          membershipType: 'annualFamily'        as const, amountDollars: 40,   isUpgradePath: true,  isAdminOnly: false },
  { id: 'five-year-family',       membershipType: 'fiveYearFamily'      as const, amountDollars: 100,  isUpgradePath: true,  isAdminOnly: false },
  { id: 'life',                   membershipType: 'life'                as const, amountDollars: 200,  isUpgradePath: true,  isAdminOnly: false },
  { id: 'life-ward',              membershipType: 'lifeWard'            as const, amountDollars: 100,  isUpgradePath: true,  isAdminOnly: false },
  { id: 'patron',                 membershipType: 'patron'              as const, amountDollars: 500,  isUpgradePath: true,  isAdminOnly: false },
  { id: 'benefactor',             membershipType: 'benefactor'          as const, amountDollars: 1000, isUpgradePath: true,  isAdminOnly: false },
  { id: 'honorary-no-vote',       membershipType: 'honoraryNoVote'      as const, amountDollars: 0,    isUpgradePath: false, isAdminOnly: true  },
]

async function main() {
  console.log('Seeding chapters...')

  for (const chapter of chapters) {
    await prisma.chapter.upsert({
      where: { id: chapter.id },
      update: {
        displayName: chapter.displayName,
        states: chapter.states,
      },
      create: {
        id: chapter.id,
        displayName: chapter.displayName,
        states: chapter.states,
      },
    })
  }

  console.log(`Seeded ${chapters.length} chapters.`)

  console.log('Seeding award names...')

  for (const awardName of awardNames) {
    await prisma.awardName.upsert({
      where: { id: awardName.id },
      update: { displayName: awardName.displayName },
      create: { id: awardName.id, displayName: awardName.displayName },
    })
  }

  console.log(`Seeded ${awardNames.length} award names.`)

  console.log('Seeding membership fees...')

  for (const fee of membershipFees) {
    await prisma.membershipFee.upsert({
      where: { id: fee.id },
      update: {
        amountDollars: fee.amountDollars,
        isUpgradePath: fee.isUpgradePath,
        isAdminOnly:   fee.isAdminOnly,
      },
      create: {
        id:             fee.id,
        membershipType: fee.membershipType,
        amountDollars:  fee.amountDollars,
        isUpgradePath:  fee.isUpgradePath,
        isAdminOnly:    fee.isAdminOnly,
      },
    })
  }

  console.log(`Seeded ${membershipFees.length} membership fees.`)

  console.log('Backfilling consecutiveSince for active members...')
  const activeWithoutConsecutive = await prisma.member.findMany({
    where: { memberStatus: 'active', consecutiveSince: null },
    select: { id: true, joinDate: true },
  })
  for (const m of activeWithoutConsecutive) {
    await prisma.member.update({
      where: { id: m.id },
      data: { consecutiveSince: m.joinDate ?? new Date() },
    })
  }
  console.log(`Backfilled consecutiveSince for ${activeWithoutConsecutive.length} active members`)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
