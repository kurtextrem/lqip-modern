const fs = require("node:fs");
const os = require("node:os");
const osPath = require("node:path");
const sharp = require("sharp");
const fetch = require("node-fetch");
const crypto = require("node:crypto");
const ct = require("colorthief");
// import { getPalette } from "colorthief";

const FILE_SIZES = `./cached-image-sizes.json`;

let dirHash = crypto.createHash("md5").
                     update(__dirname).
                     digest("hex");
const FILE_MISSES =
    `${os.tmpdir()}/image-size-misses-${dirHash}.json`;


/////////////////////////////////////////////////////////////////////////
//
// Utilities from Lean Rada:
//
//    https://github.com/Kalabasa/leanrada.com/blob/7b6739c7c30c66c771fcbc9e1dc8942e628c5024/main/scripts/update/lqip.mjs#L118-L159
//

// find the best bit configuration that would produce a color closest to target
function findOklabBits([ targetL, targetA, targetB] = arr) {
  const targetChroma = Math.hypot(targetA, targetB);
  const scaledTargetA = scaleComponentForDiff(targetA, targetChroma);
  const scaledTargetB = scaleComponentForDiff(targetB, targetChroma);

  let bestBits = [0, 0, 0];
  let bestDifference = Infinity;

  for (let lli = 0; lli <= 0b11; lli++) {
    for (let aaai = 0; aaai <= 0b111; aaai++) {
      for (let bbbi = 0; bbbi <= 0b111; bbbi++) {
        const { L, a, b } = bitsToLab(lli, aaai, bbbi);
        const chroma = Math.hypot(a, b);
        const scaledA = scaleComponentForDiff(a, chroma);
        const scaledB = scaleComponentForDiff(b, chroma);

        const difference = Math.hypot(
          L - targetL,
          scaledA - scaledTargetA,
          scaledB - scaledTargetB
        );

        if (difference < bestDifference) {
          bestDifference = difference;
          bestBits = [lli, aaai, bbbi];
        }
      }
    }
  }

  return { ll: bestBits[0], aaa: bestBits[1], bbb: bestBits[2] };
}

// Scales a or b of Oklab to move away from the center
// so that euclidean comparison won't be biased to the center
function scaleComponentForDiff(x, chroma) {
  return x / (1e-6 + Math.pow(chroma, 0.5));
}

function bitsToLab(ll, aaa, bbb) {
  const L = (ll / 0b11) * 0.6 + 0.2;
  const a = (aaa / 0b1000) * 0.7 - 0.35;
  const b = ((bbb + 1) / 0b1000) * 0.7 - 0.35;
  return { L, a, b };
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function getNormalSize({ width, height, orientation }) {
  return (orientation || 0) >= 5
    ? { width: height, height: width }
    : { width, height };
}
//
// End utilites from Lean Rada.
//

// ------------------------- BEGIN convert.mjs ------------------------------ //
/*
BSD 2-Clause License

Copyright (c) [2023], [Beeno Tung (Tung Cheung Leong)]
All rights reserved.

Redistribution and use in source and binary forms, with or without
modification, are permitted provided that the following conditions are met:

1. Redistributions of source code must retain the above copyright notice, this
   list of conditions and the following disclaimer.

2. Redistributions in binary form must reproduce the above copyright notice,
   this list of conditions and the following disclaimer in the documentation
   and/or other materials provided with the distribution.

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS"
AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE
FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL
DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR
SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER
CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY,
OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.

---

MIT License

Copyright (c) 2019 Christopher Michael Buck

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
*/
function rgbToOkLab(rgbArr) {
  let r = rgb_to_oklab({
    r: rgbArr[0],
    g: rgbArr[1],
    b: rgbArr[2],
  });
  return [ r.L, r.a, r.b ];
}

function rgb_to_oklab(c) {
  const r = gamma_inv(c.r / 255);
  const g = gamma_inv(c.g / 255);
  const b = gamma_inv(c.b / 255);

  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);

  return {
    L: l * +0.2104542553 + m * +0.793617785 + s * -0.0040720468,
    a: l * +1.9779984951 + m * -2.428592205 + s * +0.4505937099,
    b: l * +0.0259040371 + m * +0.7827717662 + s * -0.808675766,
  };
}

function gamma_inv(x) {
  return x >= 0.04045 ? Math.pow((x + 0.055) / (1.055), 2.4) : x / 12.92;
}
// -------------------------- END convert.mjs ------------------------------- //

let toLQIP = async (pathOrBuffer) => {

  let {
    opaque, ll, aaa, bbb, values, palette
  } = await getLQIPData(pathOrBuffer);

  const ca = Math.round(values[0] * 0b11);
  const cb = Math.round(values[1] * 0b11);
  const cc = Math.round(values[2] * 0b11);
  const cd = Math.round(values[3] * 0b11);
  const ce = Math.round(values[4] * 0b11);
  const cf = Math.round(values[5] * 0b11);
  const lqip =
    -(2 ** 19) +
    ((ca & 0b11) << 18) +
    ((cb & 0b11) << 16) +
    ((cc & 0b11) << 14) +
    ((cd & 0b11) << 12) +
    ((ce & 0b11) << 10) +
    ((cf & 0b11) << 8) +
    ((ll & 0b11) << 6) +
    ((aaa & 0b111) << 3) +
    (bbb & 0b111);

  return {
    lqip,
    palette
  };
};

let getLQIPData = async (pathOrBuffer) => {
  let sf = sharp(pathOrBuffer);
  let md = await sf.metadata();
  // From:
  //   https://github.com/Kalabasa/leanrada.com/blob/d08024ee63a095b4835b15f80f2eb87686d2a271/main/scripts/update/lqip/lqip.mjs#L4
  let previewBuffer = await sf.gamma(2)
                              .resize(3, 2, { fit: "fill" })
                              .sharpen({ sigma: 0.5 })
                              .removeAlpha()
                              .toFormat("raw", { bitdepth: 8 })
                              .toBuffer();
  sf = sharp(pathOrBuffer);
  let meta = await sf.metadata();
  // let stats = await sf.stats();
  const size = getNormalSize(meta);

  let dominant = (await ct.getPalette(await sf.toBuffer(), 4, 10))[0];
  let palette = await ct.getPalette(await sf.toBuffer(), 6);


  // NOTE:
  //    The `color-space` module is *probably* right about this conversion.
  //
  //    There are fudge factors in Lean's code to handle the clamping, and these
  //    don't work correctly with `color-space`, but are correct with the
  //    inline'd copy of the `convert.mjs.
  //
  //    To make this work with `color-space`, we have tried different offsets
  //    for the luminance coefficient, but they aren't the full story. Something
  //    else is off.

  // Convert the dominant colour from rgb to OKLAB
  // console.log("dominant:", dominant);
  let okl_dom = rgbToOkLab(dominant);
  const { ll, aaa, bbb } = findOklabBits(okl_dom);
  let { L, a, b } = bitsToLab(ll, aaa, bbb);

  const cells = Array.from({ length: 6 }, (_, index) => {
    let rgbArr = [
      previewBuffer.readUint8(index * 3),
      previewBuffer.readUint8(index * 3 + 1),
      previewBuffer.readUint8(index * 3 + 2),
    ];
    return rgbToOkLab(rgbArr);
  });

  const values = cells.map((arr) => clamp(0.5 + arr[0] - L, 0, 1));

  return {
    ...size,
    opaque: true,
    ll,
    aaa,
    bbb,
    values,
    palette
  };
};

//
/////////////////////////////////////////////////////////////////////////


// Look for a list of "recent misses"
let misses = [];
try {
  misses = JSON.parse(fs.readFileSync(FILE_MISSES));
} catch (e) { /* squelch */ }

if(!misses.length) {
  console.log("No images to process");
  return;
}

let sizes = {};
try {
  sizes = JSON.parse(fs.readFileSync(FILE_SIZES));
} catch (e) { /* squelch */ }

console.log("Getting metadata for:");
console.dir(misses);

(async () => {

  let generateThumbnails = async (path, key, pathOrBuffer=path) => {
    try {
      let sf = sharp(pathOrBuffer);
      let md = await sf.metadata();

      // let thumbWidth = 60;
      // let thumbHeight = parseInt((md.height / md.width) * thumbWidth);
      // console.log(path, md.height, md.width, thumbWidth, thumbHeight);
      // Generate both PNG and AVIF for now for back compat
      // let pngStr = (await sf.resize(thumbWidth, thumbHeight)
      //                       .png()
      //                       .toBuffer()).toString("base64");
      // let avifStr = (await sf.resize(thumbWidth, thumbHeight)
      //                        .avif({ quality: 30, effort: 3 })
      //                        .toBuffer()).toString("base64");

      let { lqip: lqipVal, palette } = (await toLQIP(pathOrBuffer));
      sizes[key] = {
        width: md.width,
        height: md.height,
        hasAlpha: md.hasAlpha,
        lqip: lqipVal+"",
        palette,
        // avifThumbnail: `data:image/avif;base64,${avifStr}`,
        // thumbnail: `data:image/png;base64,${pngStr}`
      };

      /*
      // Generate a full-size AVIF if we don't already have one
      if([".png", ".jpg"].includes(osPath.extname(path))) {
        let pathParts = osPath.parse(path);
        let avifPath = osPath.join(pathParts.dir, `${pathParts.name}.avif`);
        if(true || !fs.existsSync(avifPath)) {
          console.log("TODO:", avifPath);
          let nsf = sharp(pathOrBuffer);
          let avif = await nsf.avif({ quality: 60, effort: 5 });
          fs.writeFileSync(avifPath, await avif.toBuffer());
        }
      }
      */
    } catch(e) {
      console.error(`Error resizing: ${path}`);
      console.error(e);
      throw e;
    }
  };

  for (let fileOrUrl of misses) {
    let file;
    if (fileOrUrl.startsWith("/")) {

      let possiblePaths = [
        `./_posts${fileOrUrl}`,
        `.${fileOrUrl}`, // ./assets
        `./data/wp_root_dir${fileOrUrl}`,
      ];

      for(p of possiblePaths) {
        try {
          if(fs.statSync(p).isFile()) {
            file = p;
            break;
          }
        } catch(e) { /* squelch */ }
      }
      if (file) {
        await generateThumbnails(file, fileOrUrl);
      }
    } else {
      // Download the image to a buffer, then process
      let buffer = await (await fetch(fileOrUrl)).buffer();
      await generateThumbnails(fileOrUrl, fileOrUrl, buffer);
    }
  }
  fs.writeFileSync(FILE_SIZES, JSON.stringify(sizes, null, 2));
  fs.unlinkSync(FILE_MISSES);
})();
