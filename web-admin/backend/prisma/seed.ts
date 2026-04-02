/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import 'dotenv/config';
import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from 'src/generated/prisma/client';
import axios from 'axios';

const connectionString = `${process.env.DATABASE_URL}`;
const pool = new Pool({ connectionString });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });
async function main() {
  const rocketUrl: string = process.env.ROCKET_URL!;
  const username: string = process.env.ROCKET_ADMIN_USERNAME!;
  const password: string = process.env.ROCKET_ADMIN_PASSWORD!;
  const normalizedUrl = new URL(rocketUrl);
  const domain = normalizedUrl.hostname;
  const composeProjectName = process.env.COMPOSE_PROJECT_NAME ?? 'default';

  const res = await axios.post(`${rocketUrl}/api/v1/login`, {
    user: username,
    password,
  });
  const { authToken, userId } = res.data.data;
  await prisma.tenant.upsert({
    where: { id: 'default-tenant' },
    update: {
      domain,
      rootUrl: rocketUrl,
      composeProjectName,
      rocketUrl,
      adminUsername: username,
      adminPass: password,
      adminAuthToken: authToken,
      adminUserId: userId,
      deployStatus: 'RUNNING',
      lastProvisionedAt: new Date(),
    },
    create: {
      id: 'default-tenant',
      name: 'Local Rocket',
      domain,
      rootUrl: rocketUrl,
      composeProjectName,
      rocketUrl,
      adminUsername: username,
      adminPass: password,
      adminAuthToken: authToken,
      adminUserId: userId,
      deployStatus: 'RUNNING',
      lastProvisionedAt: new Date(),
    },
  });

  console.log('Tenant seeded: ', authToken, userId);
}
main()
  .then(async () => {
    await prisma.$disconnect();
    await pool.end();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    await pool.end();
    process.exit(1);
  });
