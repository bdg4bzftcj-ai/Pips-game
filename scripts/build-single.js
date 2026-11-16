#!/usr/bin/env node
// Bundles the app into one self-contained HTML file.
// Usage: node scripts/build-single.js [out.html] [--fragment]
//   --fragment  omit <html>/<head>/<body> (for hosts that wrap the page themselves)
const fs = require('fs');
const path = require('path');
const www = path.join(__dirname, '..', 'www');
const read = (f) => fs.readFileSync(path.join(www, f), 'utf8');
const args = process.argv.slice(2);
const fragment = args.includes('--fragment');
const out = args.find(a => !a.startsWith('--')) || path.join(__dirname, '..', 'dist', 'spotlock.html');

const html = read('index.html');
const body = html.slice(html.indexOf('<!--APP-->'), html.indexOf('<!--/APP-->') + 11);
const fonts = html.match(/<link rel="stylesheet" href="https:\/\/fonts[^>]+>/)[0];
const icon = 'data:image/png;base64,' + fs.readFileSync(path.join(www, 'icons/icon-192.png')).toString('base64');
const scripts = ['js/generator.js', 'data/archive.js', 'data/calibration.js', 'js/app.js']
  .map(f => '<script>\n' + read(f).replace(/<\/script/gi, '<\\/script') + '\n</script>').join('\n');
const head = [
  '<title>Spotlock</title>',
  '<meta name="claude:viewport-fit-sides" content="cover">',
  '<link rel="icon" href="' + icon + '">',
  '<link rel="apple-touch-icon" href="' + icon + '">',
  fonts,
  '<style>\n' + read('css/app.css') + '\n</style>',
].join('\n');
const doc = fragment
  ? head + '\n' + body + '\n' + scripts + '\n'
  : '<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n' +
    '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, user-scalable=no">\n' +
    '<meta name="apple-mobile-web-app-capable" content="yes">\n' + head + '\n</head>\n<body>\n' + body + '\n' + scripts + '\n</body>\n</html>\n';
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, doc);
console.log('wrote', out, (doc.length / 1024).toFixed(0) + ' KB');
