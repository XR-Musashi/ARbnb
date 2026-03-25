const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function main() {
  // Seed a demo property and annotations for local dev/testing
  const property = await prisma.property.upsert({
    where: { id: 'seed-property-001' },
    update: {},
    create: {
      id: 'seed-property-001',
      hostId: 'seed-host-user-001',
      name: 'Demo Apartment',
      address: '1 Trinity Street, Dublin 2',
      annotations: {
        create: [
          {
            title: 'WiFi Password',
            content: 'Network: ARbnb_Demo\nPassword: welcome2025',
            floorX: 0.5,
            floorY: 0.3,
            roomLabel: 'living_room',
          },
          {
            title: 'Washing Machine',
            content: 'Press the top button to start. Detergent is under the sink.',
            floorX: 0.2,
            floorY: 0.8,
            roomLabel: 'kitchen',
          },
          {
            title: 'Front Door Code',
            content: 'Keypad code: 4729. Door auto-locks after 10 seconds.',
            floorX: 0.05,
            floorY: 0.5,
            roomLabel: 'entrance',
          },
        ],
      },
    },
  });

  console.log('Seed complete:', property.name);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
