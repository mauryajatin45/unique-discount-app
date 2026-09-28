import fs from 'fs/promises';

async function run() {
  const file = await fs.readFile('app/routes/_index/route.tsx', 'utf-8');
  
  const targetShop = "althenayanhoney.myshopify.com";
  
  const modifiedLoader = `export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);

  if (url.searchParams.get("shop")) {
    throw redirect(\`/app?\${url.searchParams.toString()}\`);
  }

  // Automatically redirect to the specific store's login flow
  throw redirect(\`/auth/login?shop=${targetShop}\`);
};`;

  const newFile = file.replace(/export const loader = async \(\{ request \}: LoaderFunctionArgs\) => \{[\s\S]*?return \{ showForm: Boolean\(login\) \};\n\};/, modifiedLoader);
  
  await fs.writeFile('app/routes/_index/route.tsx', newFile);
  console.log("Patched index route!");
}
run();
