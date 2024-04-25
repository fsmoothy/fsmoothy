#!/usr/bin/env tsx
/* eslint-disable node/shebang */

import fs from 'node:fs/promises';
import path from 'node:path';
import { createInterface } from 'node:readline';
import { $ } from 'zx';

// eslint-disable-next-line unicorn/prefer-module
const packageTemplatePath = path.join(__dirname, 'package-template');

const rl = createInterface({
  input: process.stdin,
  output: process.stdout,
});

const fillTemplate = async (packageLocation: string, name: string) => {
  const files = await fs.readdir(packageLocation);

  for (const file of files) {
    const filePath = path.join(packageLocation, file);

    const fileStats = await fs.stat(filePath);

    if (fileStats.isFile()) {
      const templateContent = await fs.readFile(filePath, 'utf8');

      const newContent = templateContent.replaceAll('<%= name %>', name);
      const newPath = filePath
        .replaceAll('<%= name %>', name)
        .replace('.template', '');

      await fs.rename(filePath, newPath);
      await fs.writeFile(newPath, newContent);
    } else {
      await fillTemplate(filePath, name);
    }
  }
};

rl.question('Enter package name: ', async (name) => {
  // eslint-disable-next-line unicorn/prefer-module
  const newPackageLocation = path.join(__dirname, '..', 'packages', name);

  await $`cp -r ${packageTemplatePath} ${newPackageLocation}`;

  await fillTemplate(newPackageLocation, name);

  console.log(`Done🎊! You can find your new package at ${newPackageLocation}`);

  // eslint-disable-next-line no-process-exit
  process.exit(0);
});
