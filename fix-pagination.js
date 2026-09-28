import fs from 'fs/promises';

async function run() {
  const file = await fs.readFile('app/routes/app.settings.tsx', 'utf-8');
  
  const oldCode = `      // Check for pagination Link header
      const linkHeader = response.headers.get('link');
      if (linkHeader && linkHeader.includes('rel="next"')) {
        const links = linkHeader.split(', ');
        const nextLink = links.find(link => link.includes('rel="next"'));
        if (nextLink) {
          const match = nextLink.match(/<(.*?)>/);
          url = match ? match[1] : null;
        } else {
          url = null;
        }
      } else {
        url = null;
      }`;
      
  const newCode = `      // Check for pagination Link header (Fixed Regex)
      const linkHeader = response.headers.get('link');
      if (linkHeader) {
        const nextMatch = linkHeader.match(/<([^>]+)>;\\s*rel="next"/);
        url = nextMatch ? nextMatch[1] : null;
      } else {
        url = null;
      }`;
      
  if (file.includes(oldCode)) {
    await fs.writeFile('app/routes/app.settings.tsx', file.replace(oldCode, newCode));
    console.log("Successfully patched regex!");
  } else {
    console.log("Target code not found!");
  }
}
run();
