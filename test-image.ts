import { generateLoyaltyCard } from './app/image.server.ts';

async function test() {
  const url = await generateLoyaltyCard('test-order-123', 'John Doe', 'KING-1234', 'ALL-5678');
  console.log('Image generated at:', url);
}

test().catch(console.error);
