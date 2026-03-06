import fs from 'fs/promises';
import { createCanvas, loadImage } from "canvas";
import { PQ } from './pq.js';
import * as AIS from './ais.js';
import Config from './construct-ep-json-config.js';

PQ.env.createCanvas = createCanvas;
PQ.env.createImg = async url => {
  let res = await fetch (url);
  if (res.status !== 200) throw res;
  let buffer = Buffer.from (await res.arrayBuffer ());
  let img = await loadImage (buffer);
  //img.naturalWidth = img.width;
  //img.naturalHeight = img.height;
  return img;
};

// Create a region boundary array for the glyph specified as an image
async function getRegionBoundaryArray (image, opts) {
  async function binarize (data) {
    function getLuminance (r, g, b, a) {
      if (a === 0) return 255;
      return 0.299 * r + 0.587 * g + 0.114 * b;
    }
    
    function getLuminances (data) {
      const luminances = [];
      const positions = [];
      
      for (let i = 0; i < data.length; i += 4) {
        const a = data[i + 3];
        if (a === 0) continue;

        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];
        const lum = Math.round (0.299 * r + 0.587 * g + 0.114 * b);
        
        luminances.push (lum);
        positions.push (i);
      }
      return { luminances, positions };
    }

    function ootsuThreshold (luminances) {
      const histogram = new Array(256).fill(0);
      luminances.forEach (l => histogram[l]++);

      const total = luminances.length;
      let sum = 0;
      for (let t = 0; t < 256; t++) sum += t * histogram[t];

      let sumB = 0, wB = 0, wF = 0, maxVar = 0, threshold = 0;

      for (let t = 0; t < 256; t++) {
        wB += histogram[t];
        if (wB === 0) continue;
        wF = total - wB;
        if (wF === 0) break;
        
        sumB += t * histogram[t];
        const mB = sumB / wB;
        const mF = (sum - sumB) / wF;
        const betweenVar = wB * wF * Math.pow(mB - mF, 2);
        
        if (betweenVar > maxVar) {
          maxVar = betweenVar;
          threshold = t;
        }
      }

      return threshold;
    } // ootsuThreshold

    let bin = [];

    const {luminances} = getLuminances(data);
    const threshold = ootsuThreshold(luminances);

    for (let i = 0; i < data.length; i += 4) {
      if (data[i + 3] === 0) {
        data[i] = data[i+1] = data[i+2] = 255;
        data[i+3] = 255;
      } else {
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];
        let lum = 0.299 * r + 0.587 * g + 0.114 * b;
        const bin = lum < threshold ? 0 : 255;
        data[i] = data[i+1] = data[i+2] = bin;
      }
    }
  } // binarize

  let visited;
  let width;
  let height;

  function isOpaque(data, x, y) {
    const index = (y * width + x) * 4;
    return ! data[index];
  }

  function floodFill(data, x, y, region) {
    const stack = [[x, y]];
    visited[y][x] = true;

    while (stack.length > 0) {
      const [cx, cy] = stack.pop();
      region.push ([cx, cy]);

      const neighbors = [
        [cx + 1, cy],
        [cx - 1, cy],
        [cx, cy + 1],
        [cx, cy - 1],
      ];

      for (const [nx, ny] of neighbors) {
        if (nx >= 0 && ny >= 0 && nx < width && ny < height) {
          if (!visited[ny][nx] && isOpaque (data, nx, ny)) {
            visited[ny][nx] = true;
            stack.push([nx, ny]);
          }
        }
      }
    }
  } // floodFill

  function simplifyPath (points, tolerance = 1.5) {
    if (points.length <= 2) return points;
  
    function perpendicularDistance (point, lineStart, lineEnd) {
      const [x, y] = point;
      const [x1, y1] = lineStart;
      const [x2, y2] = lineEnd;
      
      const dx = x2 - x1;
      const dy = y2 - y1;
      const norm = Math.sqrt(dx * dx + dy * dy);
      
      if (norm === 0) return Math.sqrt((x - x1) ** 2 + (y - y1) ** 2);
      
      return Math.abs(dy * x - dx * y + x2 * y1 - y2 * x1) / norm;
    }

    function douglasPeucker(points, tolerance) {
      let maxDist = 0;
      let maxIndex = 0;
      const end = points.length - 1;
      for (let i = 1; i < end; i++) {
        const dist = perpendicularDistance(points[i], points[0], points[end]);
        if (dist > maxDist) {
          maxDist = dist;
          maxIndex = i;
        }
      }
      
      if (maxDist > tolerance) {
        const left = douglasPeucker(points.slice(0, maxIndex + 1), tolerance);
        const right = douglasPeucker(points.slice(maxIndex), tolerance);
        return [...left.slice(0, -1), ...right];
      }
      
      return [points[0], points[end]];
    }
    
    return douglasPeucker (points, tolerance);
  } // simplifyPath

  function bin2path (bin, width, height, offsetX, offsetY) {
    function signedArea (path) {
      let area = 0;
      const n = path.length;
      for (let i = 0; i < n; i++) {
        const [x0, y0] = path[i];
        const [x1, y1] = path[(i + 1) % n];
        area += (x0 * y1 - x1 * y0);
      }
      return area / 2;
    }
    
    function getWinding(path) {
      const area = signedArea(path);
      return area > 0 ? 'CCW' : 'CW';
    }
    
    let f = 1;
    let paths = [];

    const edges = [];
    for (let y = 0; y < height; y++) {
      if (!bin[y]) continue;
      for (let x = 0; x < width; x++) {
        if (bin[y][x]) {
          const startX = x * f;
          const startY = y * f;

          // left
          if (x === 0 || !bin[y][x - 1]) {
            edges.push ({startX, startY, endX: startX, endY: startY + f});
          }

          // right
          if (x === width - 1 || !bin[y][x + 1]) {
            edges.push ({endX: startX + f, endY: startY, startX: startX + f, startY: startY + f});
          }

          // top
          if (y === 0 || !( (bin[y - 1] || [])[x] )) {
            edges.push ({ startX, startY, endX: startX + f, endY: startY});
          }

          // bottom
          if (y === height - 1 || !( (bin[y + 1] || [])[x] )) {
            edges.push({endX: startX, endY: startY + f, startX: startX + f, startY: startY + f});
          }
        }
      }
    }

    while (edges.length > 0) {
      let edge = edges.pop();
      let points = [
        [edge.startX, edge.startY],
        [edge.endX, edge.endY],
      ];
      while (true) {
        let connected = false;
        for (let i = 0; i < edges.length; i++) {
          if (edges[i].startX === points.at(-1)[0] &&
              edges[i].startY === points.at(-1)[1]) {
            points.push ([edges[i].endX, edges[i].endY]);
            edges.splice (i, 1);
            connected = true;
          } else if (edges[i].endX === points.at(-1)[0] &&
                     edges[i].endY === points.at(-1)[1]) {
            points.push ([edges[i].startX, edges[i].startY]);
            edges.splice (i, 1);
            connected = true;
          } else if (edges[i].endX === points[0][0] &&
                     edges[i].endY === points[0][1]) {
            points.unshift ([edges[i].startX, edges[i].startY]);
            edges.splice (i, 1);
            connected = true;
          } else if (edges[i].startX === points[0][0] &&
                     edges[i].startY === points[0][1]) {
            points.unshift ([edges[i].endX, edges[i].endY]);
            edges.splice (i, 1);
            connected = true;
          }
        }
        if (!connected) break;
      }

      // Remove redundant points
      for (let i = 1; i < points.length - 1; i++) {
        const [prevX, prevY] = points[i - 1];
        const [currentX, currentY] = points[i];
        const [nextX, nextY] = points[i + 1];
        if ((prevX === currentX && currentX === nextX) ||
            (prevY === currentY && currentY === nextY)) {
          points.splice (i, 1);
          i--;
        }
      }

      let path = [];
      path.push ([points[0][0] + offsetX, points[0][1] + offsetY]);
      for (let i = 1; i < points.length - 1; i++) {
        path.push ([points[i][0] + offsetX, points[i][1] + offsetY]);
      }

      path = simplifyPath (path, /* tolerance = */ 1.0);
      paths.push (path);
    } // edges

    if (paths.length) {
      let w = getWinding (paths[0]);
      if (w !== 'CW') {
        paths[0] = paths[0].reverse ();
      }
    }
    for (let i = 1; i < paths.length; i++) {
      let w = getWinding (paths[i]);
      if (w !== 'CCW') {
        paths[i] = paths[i].reverse ();
      }
    }
    
    return paths;
  } // bin2path
  
  width = image.width;
  height = image.height;
  let data = image.data;
  await binarize (data);

  visited = new Array(height).fill(0).map(() => new Array(width).fill(false));

  const regions = [];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (!visited[y][x] && isOpaque(data, x, y)) {
        const region = [];
        floodFill (data, x, y, region);
        regions.push(region);
      }
    }
  }

  let pathSets = [];
  for (let region of regions) {
    let bin = [];
    for (let point of region) {
      bin[point[1]] = bin[point[1]] || [];
      bin[point[1]][point[0]] = true;
    }
    let paths = bin2path (bin, width, height, 0, 0);
    pathSets.push (paths);
  }

  if (opts.debug) {
    let x = `<svg xmlns="http://www.w3.org/2000/svg">`;
    pathSets.forEach (paths => {
      let p = paths.map (path => { 
        return 'M ' + path.join (' ');
      }).join (' ');
      x += `<path d="${p}" fill="black"/>`;
    });
    x += `</svg>`;
    await fs.writeFile ("local/debug1.svg", x);
  }

  return pathSets;
} // getRegionBoundaryArray

(async () => {
  const CurrentVersion = 7;
    
  let debug = false;
  // If true, version is ignored and all paths are regenerated.  In
  // addition, debug file is generated.
  //debug = true;

  const RegionListJsonPath = "local/list.json";
  const EPJsonPath = "local/paths.json";
  
  let psList = {};
  try {
    psList = JSON.parse (await fs.readFile (EPJsonPath));
  } catch (e) {
    if (e.code === 'ENOENT') {
      //
    } else {
      throw e;
    }
  }

  let json = JSON.parse (await fs.readFile (RegionListJsonPath));
  let dataSource = new AIS.ImageDataSource (Config);
  let annotationStorage = new AIS.ClassicAnnotationStorage (Config);

  const createGlyphData = async ref => {
    let item = json.items[ref];
    if (!item.tags.free) throw new Error (`A non-free image ${ref} is chosen for ${groupRef}`);

    let legal = {};
    Object.keys (item.image_source || {}).forEach (_ => {
      if (/^legal/.test (_)) {
        legal[_] = item.image_source[_];
      }
    });
    if (psList[ref]) psList[ref].legal = legal;
    
    // Not updated
    if (psList[ref] && psList[ref].v === CurrentVersion &&
        psList[ref].sizeRef == item.size_ref &&
        !debug) return null;

    let parsed = dataSource.parseImageInput (item);
    if (!parsed) {
      console.log (item);
      throw new Error ("Bad image input");
    }

    {
      let json = await annotationStorage.getAnnotationData ({imageSource: parsed.imageSource});
      let item = json?.items?.find (_ => _.regionKey === parsed.imageRegion.regionKey);
      if (!item) throw new Error ("Bad region");
      parsed = dataSource.parseImageInput ({
        image_source: json.image,
        image_region: {region_boundary: item.regionBoundary},
      });
      if (!parsed) throw new Error ("Bad image input");
    }

    try {
      let image = await dataSource.getClippedImageData (parsed, {useCache: true});
      let regionBoundaryArray = await getRegionBoundaryArray (image, {});
      psList[ref] = {
        v: CurrentVersion,
        regionBoundary: regionBoundaryArray,
        legal,
      };
    } catch (e) {
      console.log (item, e);
      throw new Error ("Bad image input");
    }

    return item;
  }; // createGlyphData
  
  let count = Object.keys (json.groups).length;
  let i = 0;
  for (let groupRef in json.groups) {
    if ((i++ % 10) === 0) {
      process.stderr.write (`\r${i}/${count}... `);
    }

    let ref = json.groups[groupRef].chosen_region_ref;
    if (!ref) continue;
    
    let item = await createGlyphData (ref);
    if (!item) continue; // not a new item
    
    if (item.size_ref) {
      psList[ref].sizeRef = item.size_ref;
      await createGlyphData (item.size_ref);
    }
  } // groupRef

  process.stderr.write ("done\n");
  await fs.writeFile (EPJsonPath, JSON.stringify (psList));
}) ();

/*

Copyright 2026 Wakaba <wakaba@suikawiki.org>.

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful, but
WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the GNU
Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public
License along with this program.  If not, see
<https://www.gnu.org/licenses/>.

*/
