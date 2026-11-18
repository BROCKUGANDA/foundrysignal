#!/usr/bin/env node
/**
 * FoundrySignal icon pipeline.
 *
 * Renders the PNG set (PWA 192/512, maskable 512, Apple touch 180) from the
 * editable SVG masters in public/brand/. Source of truth is the SVG — never
 * hand-edit the PNGs.
 *
 * Usage: node scripts/gen-icons.mjs
 */

import sharp from "sharp";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const PUBLIC = resolve(here, "../public");
const BRAND = join(PUBLIC, "brand");

const BRAND_BG = { r: 8, g: 11, b: 18, alpha: 1 }; // --fs-obsidian-50

const glyph = readFileSync(join(BRAND, "app-glyph.svg"));
const emblem = readFileSync(join(BRAND, "emblem-mono.svg"));

async function png(svg, size, out, opts = {}) {
  const bg = opts.background ?? BRAND_BG;
  await sharp(svg, { density: 384 })
    .resize(size, size, { fit: "contain", background: bg })
    .flatten({ background: bg })
    .png({ compressionLevel: 9 })
    .toFile(join(PUBLIC, out));
  console.log(`wrote ${out} (${size}x${size})`);
}

async function maskable(size, out) {
  // Maskable icons are cropped to a circle by Android: keep the mark inside
  // the central 80% safe zone on a full-bleed brand field.
  const bg = BRAND_BG;
  const inset = Math.round(size * 0.1);
  const inner = size - inset * 2;
  const mark = await sharp(glyph, { density: 384 })
    .resize(inner, inner, { fit: "contain", background: { ...bg, alpha: 0 } })
    .png()
    .toBuffer();
  await sharp({ create: { width: size, height: size, channels: 4, background: bg } })
    .composite([{ input: mark, left: inset, top: inset }])
    .png({ compressionLevel: 9 })
    .toFile(join(PUBLIC, out));
  console.log(`wrote ${out} (${size}x${size}, maskable safe zone)`);
}

await png(glyph, 192, "icon-192.png");
await png(glyph, 512, "icon-512.png");
await maskable(512, "icon-512-maskable.png");
await png(glyph, 180, "apple-touch-icon.png");

// Monochrome emblem plate for `mask-icon` (Safari pinned tab / PWA maskable).
await sharp(emblem, { density: 384 })
  .resize(64, 64, { fit: "contain", background: { ...BRAND_BG, alpha: 0 } })
  .png()
  .toFile(join(PUBLIC, "brand", "emblem-mono-64.png"));
console.log("wrote brand/emblem-mono-64.png (64x64)");

console.log("done");