import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const outputPath = resolve(process.cwd(), 'firebase-config.js');

const requiredEnvMap = {
  apiKey: 'FIREBASE_API_KEY',
  authDomain: 'FIREBASE_AUTH_DOMAIN',
  projectId: 'FIREBASE_PROJECT_ID',
  messagingSenderId: 'FIREBASE_MESSAGING_SENDER_ID',
  appId: 'FIREBASE_APP_ID',
};

const optionalEnvMap = {
  measurementId: 'FIREBASE_MEASUREMENT_ID',
};

const config = {};
const missingKeys = [];

for (const [configKey, envKey] of Object.entries(requiredEnvMap)) {
  const value = process.env[envKey]?.trim();
  if (!value) {
    missingKeys.push(envKey);
    continue;
  }
  config[configKey] = value;
}

for (const [configKey, envKey] of Object.entries(optionalEnvMap)) {
  const value = process.env[envKey]?.trim();
  if (value) {
    config[configKey] = value;
  }
}

const firebaseConfig = missingKeys.length ? null : config;
const firebaseConfigError = missingKeys.length
  ? `Missing Firebase configuration. Set these environment variables before deploying: ${missingKeys.join(', ')}`
  : null;

const fileContents = `export const firebaseConfig = ${JSON.stringify(firebaseConfig, null, 2)};\nexport const firebaseConfigError = ${JSON.stringify(firebaseConfigError)};\nexport default firebaseConfig;\n`;

await writeFile(outputPath, fileContents, 'utf8');

if (firebaseConfigError) {
  console.warn(`[vladder] ${firebaseConfigError}`);
} else {
  console.log('[vladder] Generated firebase-config.js from environment variables.');
}