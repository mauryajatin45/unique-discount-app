const linkHeader = '<https://althenayanhoney.myshopify.com/admin/api/2024-01/orders.json?page_info=eyJkaXJlY3Rpb24iOiJuZXh0IiwibGFzdF9pZCI6MTIzNDU2LCJsYXN0X3ZhbHVlIjoiMjAyMy0wMS0wMSAxMjowMDowMCJ9&limit=250>; rel="next"';

let url = "";
if (linkHeader && linkHeader.includes('rel="next"')) {
  const links = linkHeader.split(', ');
  const nextLink = links.find(link => link.includes('rel="next"'));
  if (nextLink) {
    const match = nextLink.match(/<(.*?)>/);
    url = match ? match[1] : null;
  } else {
    url = null;
  }
}
console.log("Extracted URL:", url);
