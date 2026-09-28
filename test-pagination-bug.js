const linkHeader = '<https://althenayanhoney.myshopify.com/prev>; rel="previous",<https://althenayanhoney.myshopify.com/next>; rel="next"';

let url = "";
if (linkHeader && linkHeader.includes('rel="next"')) {
  const links = linkHeader.split(', '); // BUG: what if there's no space?
  const nextLink = links.find(link => link.includes('rel="next"'));
  if (nextLink) {
    const match = nextLink.match(/<(.*?)>/);
    url = match ? match[1] : null;
  } else {
    url = null;
  }
}
console.log("Extracted URL:", url);
