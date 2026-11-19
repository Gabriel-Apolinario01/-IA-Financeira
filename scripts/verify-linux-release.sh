#!/usr/bin/env bash
# Run after the production build, in a clean Linux CI checkout.
set -euo pipefail
work=$(mktemp -d "${RUNNER_TEMP:?}/finance-release.XXXXXX")
source_dir="$PWD"
mkdir -p "$work/package/lib" "$work/package/scripts" "$work/unpacked"
cp package.json package-lock.json next.config.mjs "$work/package/"
cp -r db public "$work/package/"
cp lib/{auth,postgres}-config.mjs "$work/package/lib/"
cp scripts/{start-azure,prepare-azure-db,read-document}.mjs "$work/package/scripts/"
tar --exclude='.next/cache' --exclude='.next/dev' -cf - .next | tar -xf - -C "$work/package"
(
  cd "$work/package"
  npm ci --omit=dev --include=optional --no-audit
  zip -q -r "$RUNNER_TEMP/node-app.zip" .
)
unzip -q "$RUNNER_TEMP/node-app.zip" -d "$work/unpacked"
cd "$work/unpacked"
node -e "if (process.arch !== 'x64' || process.versions.node.split('.')[0] !== '24') process.exit(1)"
test ! -d node_modules/embedded-postgres
node --input-type=module -e "import sharp from 'sharp'; console.log(process.platform, process.arch, process.version, 'libvips', sharp.versions.vips)"
fixture="$source_dir/docs/evidencias-final"
/usr/bin/time -f 'scanned_pdf: elapsed=%e s, peak_reader_RSS=%M KiB' timeout 45 \
  node --max-old-space-size=256 scripts/read-document.mjs application/pdf extract < "$fixture/conta-digitalizada.pdf" > "$work/reading.json"
node -e "const p=require(process.argv[1]); if(p[0].method !== 'ocr' || !p[0].text.includes('182,34')) process.exit(1)" "$work/reading.json"
node "$source_dir/scripts/verify-release-server.mjs" "$work"
sha256sum "$RUNNER_TEMP/node-app.zip"
