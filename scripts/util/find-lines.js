#!/usr/bin/env node
// Prints line numbers containing a pattern for a given file
// Usage: node scripts/util/find-lines.js path/to/file.js configured:

const fs = require('fs');

const [,, file, ...patternParts] = process.argv;
const pattern = patternParts.join(' ');
if (!file || !pattern) {
  console.error('Usage: node scripts/util/find-lines.js <file> <pattern>');
  process.exit(1);
}

const content = fs.readFileSync(file, 'utf8').split(/\r?\n/);
const matches = [];
content.forEach((line, idx) => {
  if (line.includes(pattern)) {
    matches.push({ line: idx + 1, text: line });
  }
});

if (matches.length === 0) {
  console.log('No matches found');
} else {
  for (const m of matches) {
    console.log(`${m.line}: ${m.text}`);
  }
}

