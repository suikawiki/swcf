const fs = require ('fs/promises');
const opentype = require ("./opentype.js");
const OTWriter = require ('./otwriter.js');

const getOT = async path => {
  const read = await fs.readFile (path);
  const ab = read.buffer;
  try {
    return opentype.parse (ab, {});
  } catch (e) {
    console.log ("Failed to read OpenType file", path);
    throw e;
  }
}; // getOT

let getSourceFont = (ot, opts) => {
  let unicodeCmap = ot.tables.cmap.subtables.filter
      (_ => _.platformID === 3 && _.encodingID === 10) [0] ||
  ot.tables.cmap.subtables.filter
      (_ => _.platformID === 3 && _.encodingID === 1) [0];
  let sf = {
    unicodeCmap, glyphs: ot.glyphs,
    
    upem: ot.unitsPerEm,
    ascender: ot.tables.os2.sTypoAscender,
    descender: ot.tables.os2.sTypoDescender,

    gsub: ot.tables.gsub,

    legal: {
      name: ot.names.fullName?.en,
      copyright: (ot.names.copyright || {}).en,
      license: opts.licenseText || ot.names.license?.en,
      licenseURL: (ot.names.licenseURL || {}).en,
      trademark: (ot.names.trademark || {}).en,
      licenseAdditionalText: opts.licenseAdditionalText,
      licenseSourceWebSite: opts.licenseSourceWebSite,
    },
  };

  if (opts.useHheaMetrics) {
    sf.ascender = ot.tables.hhea.ascender;
    sf.descender = ot.tables.hhea.descender;
    sf.upem = sf.ascender - sf.descender;
  }

  let height = sf.ascender - sf.descender;
  sf.middle = sf.descender + height/2;

  return sf;
}; // getSourceFont

let getEGFont = async (path) => {
  let sf = {
    data: [], isHW: [], isDW: [], isTW: [], isDH: [], isTH: [],
    isH15: [], isRed: [], withRed: [],

    legal: {
      name: 'SuikaWiki eg',
      //copyright: (ot.names.copyright || {}).en,
      license: 'Public Domain.',
      //licenseURL: (ot.names.licenseURL || {}).en,
      //trademark: (ot.names.trademark || {}).en,
    },
  };

  let read = await fs.readFile (path);
  let text = read.toString ('utf-8');
  text.split (/\n/).forEach (line => {
    if (line.match (/^\s*#/)) {
      return;
    }

    let m = line.match (/^(eg[1-9][0-9]*)(hw|dw|tw|dh|th|h15|red|)\s+([0-9a-fA-F]+)(?:\s+red\s+([0-9A-Fa-f]+)|)\s*$/);
    if (m) {
      if (sf.data[m[1]]) throw new Error ("Duplicate glyph |"+m[1]+"|");
      sf.data[m[1]] = m[3];
      if (m[2] === 'hw') sf.isHW[m[1]] = true;
      if (m[2] === 'dw') sf.isDW[m[1]] = true;
      if (m[2] === 'tw') sf.isTW[m[1]] = true;
      if (m[2] === 'dh') sf.isDH[m[1]] = true;
      if (m[2] === 'th') sf.isTH[m[1]] = true;
      if (m[2] === 'h15') sf.isH15[m[1]] = true;
      if (m[2] === 'red') sf.isRed[m[1]] = true;
      if (m[4]) sf.withRed[m[1]] = m[4];
      return;
    }

    if (line.match (/\S/)) {
      throw new Error ("Bad line: |"+line+"|");
    }
  });

  let size = 32;
  function hex2bin (hex) {
    let bin = Array.from ({ length: size }, () => Array (size).fill (0));
    
    let index = 0;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x += 8) {
        const byte = parseInt (hex.substring (index, index + 2), 16);
        for (let i = 0; i < 8; i++) {
          bin[y][x + i] = (byte >> (7 - i)) & 1;
        }
        index += 2;
      }
    }
    return bin;
  } // hex2bin

  function bin2path (bin, upem, ascender) {
    let f = upem / size;
    let top = ascender;

    const path = new opentype.Path ();

    const edges = [];
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        if (bin[y][x] === 1) {
          const startX = x * f;
          const startY = y * f;

          if (x === 0 || bin[y][x - 1] === 0) {
            edges.push({startX, startY, endX: startX, endY: startY + f});
          }

          if (x === size - 1 || bin[y][x + 1] === 0) {
            edges.push({endX: startX + f, endY: startY, startX: startX + f, startY: startY + f});
          }

          if (y === 0 || bin[y - 1][x] === 0) {
            edges.push({ startX, startY, endX: startX + f, endY: startY});
          }

          if (y === size - 1 || bin[y + 1][x] === 0) { 
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

      for (let i = 1; i < points.length - 1; i++) {
        const [prevX, prevY] = points[i - 1];
        const [currentX, currentY] = points[i];
        const [nextX, nextY] = points[i + 1];
        
        if ((prevX === currentX && currentX === nextX) || (prevY === currentY && currentY === nextY)) {
          points.splice(i, 1);
          i--;
        }
      }
      
      path.moveTo(points[0][0], top - points[0][1]);
      for (let i = 1; i < points.length - 1; i++) {
        path.lineTo(points[i][0], top - points[i][1]);
      }
    }

    return path;
  } // bin2path

  sf.getGlyphPaths = function (name, upem, asc, desc) {
    let hex = this.data[name];
    if (!hex) return null;

    let bin = hex2bin (hex);
    let path = bin2path (bin, upem, asc);

    if (this.isHW[name]) path.isHW = true;
    if (this.isDW[name]) path.isDW = true;
    if (this.isTW[name]) path.isTW = true;
    if (this.isDH[name]) path.isDH = true;
    if (this.isTH[name]) path.isTH = true;
    if (this.isH15[name]) path.isH15 = true;
    if (this.isRed[name]) path.isRed = true;

    if (this.withRed[name]) {
      let bin = hex2bin (this.withRed[name]);
      let path2 = bin2path (bin, upem, asc);
      path.redPath = path2;
    }

    return [path];
  }; // getGlyphPaths

  return sf;
}; // getEGFont

let getEPFont = async (path, allowedLegalKeys) => {
  let sf = {usedLegals: []};
  
  let read = await fs.readFile (path);
  let glyphData = JSON.parse (read.toString ('utf-8'));

  function getRegionBoundaryBoundingBox (pathSets) {
    let xx = [];
    let yy = [];
    pathSets.forEach (paths => {
      paths.forEach (path => {
        xx.push (Math.min (...path.map (_ => _[0])));
        yy.push (Math.min (...path.map (_ => _[1])));
        xx.push (Math.max (...path.map (_ => _[0])));
        yy.push (Math.max (...path.map (_ => _[1])));
      });
    });
    let x = Math.min (...xx);
    let y = Math.min (...yy);
    let maxX = Math.max (...xx);
    let maxY = Math.max (...yy);
    let width = maxX - x + 1;
    let height = maxY - y + 1;
    return {x, y, width, height, maxX, maxY};
  }; // A.getRegionBoundaryBoundingBox

  sf.getGlyphPaths = function (name, upem, asc, desc) {
    let ps = glyphData[name];
    if (!ps) return null;
    
    if (!allowedLegalKeys[ps.legal?.legalKey]) {
      console.log (`ep glyph |${name}| is not used (license: ${ps.legal?.legalKey})`);
      return null;
    }
    this.usedLegals.push (ps.legal);

    let bb = getRegionBoundaryBoundingBox (ps.regionBoundary);
    let offsetX = bb.x;
    let offsetY = bb.y;
    let mp = 0.05;
    let scaleY = upem * (1 - mp - mp) / bb.height;
    let scaleX = scaleY;
    let deltaX = upem * mp;
    let deltaY = upem * mp;
    let tsb = upem * mp;
    if (ps.sizeRef) {
      let qs = glyphData[ps.sizeRef];
      let qbb = getRegionBoundaryBoundingBox (qs.regionBoundary);
      scaleY = upem * (1 - mp - mp) / qbb.height;
      scaleX = scaleY;
      let hs = (qbb.height - bb.height) * scaleY / 2;
      deltaY += hs;
    }
    let aw = upem * mp + bb.width * scaleX + upem * mp;
    let ah = tsb + bb.height * scaleY + upem * mp;
    let t = (_) => [(_[0] - offsetX) * scaleX + deltaX, upem - ((_[1] - offsetY) * scaleY + deltaY) + desc];

    let pp = [];

    let p = new opentype.Path;
    p._ps = [];
    let pSize = 0;
    pp.push (p);
    ps.regionBoundary.forEach (paths => {
      if (pSize > 20000) {
        p = new opentype.Path;
        p._ps = [];
        pSize = 0;
        pp.push (p);
      }
      p._ps.push (paths);
      paths.forEach (path => {
        p.moveTo (...t (path[0]));
        path.forEach (_ => p.lineTo (...t (_)));
        pSize += path.length * 2 + 2;
      });
    });
    if (pp.length === 1) {
      p._aw = aw;
      p._ah = ah;
      p._tsb = tsb;
    } else {
      pp.forEach (p => {
        let pbb = getRegionBoundaryBoundingBox (p._ps);
        p._aw = aw;
        p._ah = 0;
        p._tsb = tsb + (pbb.y - bb.y) * scaleY;
      });
      p._aw = aw;
      p._ah = ah;
    }
    
    return pp;
  }; // getGlyphPaths

  Object.defineProperty (sf, 'legal', {
    get () {
      let texts = [];
      let found = {};
      
      this.usedLegals.forEach (l => {
        let text = "";
        Object.keys (l).sort ((a, b) => a>b?-1:+1).forEach (_ => {
          if ({
            legalLang: true, legalDir: true, legalWritingMode: true,
          }[_]) return;
          let value = l[_];
          if (_ === 'legalOriginalURL') {
            value = '<' + value + '>';
          }
          let prefix;
          if (_ === 'legalCredit') {
            prefix = '';
          } else if (_ === 'legalKey') {
            prefix = 'SPDX ID: ';
          } else {
            prefix = _.replace (/^legal/, '') + ': ';
          }
          text += prefix + value + "\n";
        });
        if (!found[text]) texts.push (text);
        found[text] = true;
      });

      let legal = {};
      legal.licenseAdditionalText = texts.join ("\n");
      return legal;
    },
  });

  return sf;
}; // getEPFont

const createDestFont = (sf) => {
  let df = {
    glyphs: [],
    baseGlyphRecords: [],
    layerRecords: [],
    added: [],
    isRed: {},
    withRed: {},
    splitted: {},
    
    upem: sf.upem,
    ascender: sf.ascender,
    descender: sf.descender,
    middle: sf.middle,

    legal: sf.legal,
  };
  return df;
}; // createDestFont

(async (kgmapFileName, partKey) => {

  let copyGlyph = (sf, sfGid, df, opts) => {
    if (!sfGid) throw new Error ("Bad source glyph ID");
    let sGlyph = sf.glyphs.get (sfGid);

    let path = sGlyph.path;
    if (opts.vrt2) {
      let path2 = new opentype.Path;
      for (const cmd of path.commands) {
        const { type, x, y, x1, y1, x2, y2 } = cmd;
        if (type === 'M' || type === 'L') {
          path2[type === 'M' ? 'moveTo' : 'lineTo'](y, -x);
        } else if (type === 'C') {
          path2.curveTo(y1, -x1, y2, -x2, y, -x);
        } else if (type === 'Q') {
          path2.quadTo(y1, -x1, y, -x);
        } else if (type === 'Z') {
          path2.closePath();
        }
      }
      path = path2;
      opts.deltaX = -df.descender;
      opts.deltaY = df.upem/2 + df.descender;
    }

    let dGlyph = new opentype.Glyph ({
      name: sGlyph.name,
      advanceWidth: sGlyph.advanceWidth,
      advanceHeight: sGlyph.advanceHeight,
      topSideBearing: sGlyph.topSideBearing,
      path,
    });
    
    if (sf.upem !== df.upem ||
        sf.descender !== df.descender || sf.ascender !== df.ascender ||
        opts.large || opts.small ||
        opts.scaleX || opts.scaleY || opts.deltaY ||
        opts.reHeight || opts.reWidth) {
      let scale = opts.large ? 1.75 : opts.small ? 0.75 : 1;
      let scaleX = opts.scaleX || 1;
      let scaleY = opts.scaleY || 1;
      let deltaY = opts.deltaY || 0;
      let x = opts.deltaX || 0;
      let y = ( df.middle - (df.upem / sf.upem) * sf.middle ) + deltaY;
      if (opts.small) {
        x += 0.125 * df.upem;
        y = y - df.descender * 0.75 + df.descender;
        dGlyph.advanceWidth /= scale;
      }
      dGlyph.advanceWidth *= df.upem / sf.upem * scale * scaleX;
      if (opts.reWidth) {
        let delta = df.upem - dGlyph.advanceWidth;
        dGlyph.advanceWidth += delta;
        x += delta/2;
      }
      dGlyph.path = dGlyph.getPath (x, y, df.upem, {
        xScale: (df.upem / sf.upem) * scale * scaleX,
        yScale: -1 * (df.upem / sf.upem) * scale * scaleY,
      });
      if (opts.small) {
        //
      } else if (scale * scaleY !== 1 || !Number.isFinite (dGlyph.advanceHeight)) {
        dGlyph.advanceHeight = df.upem * scale * scaleY;
        dGlyph.topSideBearing = dGlyph.advanceHeight + df.descender - dGlyph.getMetrics ().yMax;
      } else {
        dGlyph.advanceHeight *= df.upem / sf.upem * scale * scaleY;
        dGlyph.topSideBearing *= df.upem / sf.upem * scale * scaleY;
      }
      if (opts.reHeight || opts.small) {
        dGlyph.topSideBearing = dGlyph.advanceHeight + df.descender * scale * scaleY - dGlyph.getMetrics ().yMax;
      }
    } else {
      if (!Number.isFinite (dGlyph.advanceHeight) || opts.vrt2) {
        dGlyph.advanceHeight = df.upem;
        dGlyph.topSideBearing = dGlyph.advanceHeight + df.descender - dGlyph.getMetrics ().yMax;
      }
    }
    return dGlyph;
  };

  function binSearch (arr, value) {
    var imin = 0;
    var imax = arr.length - 1;
    while (imin <= imax) {
      var imid = (imin + imax) >>> 1;
      var val = arr[imid];
      if (val === value) {
	return imid;
      } else if (val < value) {
	imin = imid + 1;
      } else { imax = imid - 1; }
    }
    // Not found: return -1-insertion point
    return -imin - 1;
  }

  function searchRange(ranges, value) {
    var range;
    var imin = 0;
    var imax = ranges.length - 1;
    while (imin <= imax) {
      var imid = (imin + imax) >>> 1;
      range = ranges[imid];
      var start = range.start;
      if (start === value) {
	return range;
      } else if (start < value) {
	imin = imid + 1;
      } else { imax = imid - 1; }
    }
    if (imin > 0) {
      range = ranges[imin - 1];
      if (value > range.end) { return 0; }
      return range;
    }
  }

  let getCoverageIndex = function(coverageTable, glyphIndex) {
    switch (coverageTable.format) {
    case 1:
      var index = binSearch(coverageTable.glyphs, glyphIndex);
      return index >= 0 ? [index, 0] : -1;
    case 2:
      var range = searchRange(coverageTable.ranges, glyphIndex);
      return range ? [range.index, glyphIndex - range.start] : -1;
    }
  };

  let applyFeature = (font, feat, gid1) => {
    let gsub = font.gsub;
    if (!gsub) return gid1;
    
    const feature = gsub.features.find(f => f.tag === feat);
    if (!feature) return gid1;

    for (let i of feature.feature.lookupListIndexes) {
      let lookup = gsub.lookups[i];
      if (!lookup) continue; // broken
      
      for (const subtable of lookup.subtables) {
        let v = getCoverageIndex (subtable.coverage, gid1);
        if (v === -1) continue;
        
        if (subtable.substFormat === 2) {
          return subtable.substitute[v[0] + v[1]] ;
          
        } else {
          throw new Error ("Bad substFormat: " + subtable.substFormat);
        }
      }
    }

    return gid1;
  }; // applyFeature
  let applyLigFeature = (font, feat, gid1, gid2) => {
    let gsub = font.gsub;
    if (!gsub) return gid1;
    
    const feature = gsub.features.find(f => f.tag === feat);
    if (!feature) return gid1;

    for (let i of feature.feature.lookupListIndexes) {
      let lookup = gsub.lookups[i];
      if (!lookup) continue; // broken
      
      for (const subtable of lookup.subtables) {
        let v = getCoverageIndex (subtable.coverage, gid1);
        if (v === -1) continue;
        
        if (subtable.substFormat === 1) {
          let lss = subtable.ligatureSets[v[0] + v[1]];
          for (let ls of lss) {
            if (ls.components.length === 1 && ls.components[0] === gid2) {
              return ls.ligGlyph;
            }
          }
        } else {
          throw new Error ("Bad substFormat: " + subtable.substFormat);
        }
      }
    }

    return gid1;
  }; // applyLigFeature

  async function generate (code, inFonts, opts) {
    const df = createDestFont (inFonts.base);
    df.unicodeCmap = {glyphIndexMap: {}};

    if (opts.notdef) {
      df.glyphs.push (inFonts.base.glyphs.get (0));
    }
    await code (df);

    let insertGlyphByRef = (glyphRef, code, opts) => {
      if (!glyphRef) throw new Error ('glyphRef not specified');
      if (glyphRef[1] !== "" && !inFonts[glyphRef[1]]) glyphRef = ['cmap', 'base', 0x3013];

      let copy = (path2, path, deltaX, deltaY, scaleX, scaleY) => {
        deltaY = deltaY - df.descender/2 + df.descender;
        for (let  cmd of path.commands) {
          let { type, x, y, x1, y1, x2, y2 } = cmd;
          if (type === 'M' || type === 'L') {
            path2[type === 'M' ? 'moveTo' : 'lineTo']
            (x * scaleX + deltaX, y * scaleY + deltaY);
          } else if (type === 'C') {
            path2.curveTo
            (x1 * scaleX + deltaX, y1 * scaleY + deltaY,
             x2 * scaleX + deltaX, y2 * scaleY + deltaY,
             x * scaleX + deltaX, y * scaleY + deltaY);
          } else if (type === 'Q') {
            path2.quadTo (x1 * scaleX + deltaX, y1 * scaleY + deltaY,
                          x * scaleX + deltaX, y * scaleY + deltaY);
          } else if (type === 'Z') {
            path2.closePath ();
          }
        }
      }; // copy
      
      if (glyphRef[0] === 'gid' || glyphRef[0] === 'gidpwid?') {
        let glyphId = glyphRef[2];
        if (glyphRef[0] === 'gidpwid?') {
          let glyphId2 = applyFeature (inFonts[glyphRef[1]], 'pwid', glyphId);
          glyphId = glyphId2;
          // XXX palt
        }
        
        let glyph = copyGlyph (inFonts[glyphRef[1]], glyphId, df, {
          reHeight: inFonts[glyphRef[1]].reHeight,
          reWidth: inFonts[glyphRef[1]].reWidth,
        });
        
        let gid = df.glyphs.length;
        df.glyphs.push (glyph);
        code (glyph);
        return gid;
      } else if (glyphRef[0] === 'cmap') {
        var glyphId = inFonts[glyphRef[1]].unicodeCmap.glyphIndexMap[glyphRef[2]];
        let glyph = copyGlyph (inFonts[glyphRef[1]], glyphId, df, {
          reHeight: inFonts[glyphRef[1]].reHeight,
          reWidth: inFonts[glyphRef[1]].reWidth,
        });
        let gid = df.glyphs.length;
        
        df.glyphs.push (glyph);
        code (glyph);
        return gid;
      } else if ((glyphRef[0] === 'smallof' || glyphRef[0] === 'largeof') &&
                 glyphRef[1] !== 'gw') {
        var glyphId = inFonts[glyphRef[1]].unicodeCmap.glyphIndexMap[glyphRef[2]];
        let glyph = copyGlyph (inFonts[glyphRef[1]], glyphId, df, {
          large: glyphRef[0] === 'largeof',
          small: glyphRef[0] === 'smallof',
          reHeight: inFonts[glyphRef[1]].reHeight,
          reWidth: inFonts[glyphRef[1]].reWidth,
        });
        let gid = df.glyphs.length;
        df.glyphs.push (glyph);
        code (glyph);
        return gid;
      } else if (glyphRef[0] === 'height4' || glyphRef[0] === 'height3' ||
                 glyphRef[0] === 'height2') {
        var glyphId = inFonts[glyphRef[1]].unicodeCmap.glyphIndexMap[glyphRef[2]];
        let glyph = copyGlyph (inFonts[glyphRef[1]], glyphId, df, {
          scaleY: (glyphRef[0] === 'height4' ? 4 : glyphRef[0] === 'height3' ? 3 : 2),
          reHeight: inFonts[glyphRef[1]].reHeight,
          reWidth: inFonts[glyphRef[1]].reWidth,
        });
        let gid = df.glyphs.length;
        df.glyphs.push (glyph);
        code (glyph);
        return gid;
      } else if (glyphRef[0] === 'width4' || glyphRef[0] === 'width3' ||
                 glyphRef[0] === 'width2') {
        var glyphId = inFonts[glyphRef[1]].unicodeCmap.glyphIndexMap[glyphRef[2]];
        let glyph = copyGlyph (inFonts[glyphRef[1]], glyphId, df, {
          scaleX: (glyphRef[0] === 'width4' ? 4 : glyphRef[0] === 'width3' ? 3 : 2),
          reHeight: inFonts[glyphRef[1]].reHeight,
          reWidth: inFonts[glyphRef[1]].reWidth,
        });
        let gid = df.glyphs.length;
        df.glyphs.push (glyph);
        code (glyph);
        return gid;
      } else if (glyphRef[0] === 'vert' || glyphRef[0] === 'vkna' ||
                 glyphRef[0] === 'pwid?' || glyphRef[0] === 'vpwid?') {
        var glyphId = inFonts[glyphRef[1]].unicodeCmap.glyphIndexMap[glyphRef[2]];
        let glyphId2 = applyFeature (inFonts[glyphRef[1]], {
          'pwid?' : 'pwid',
        }[glyphRef[0]] || glyphRef[0], glyphId);
        if (glyphId === glyphId2 &&
            glyphRef[0] !== 'pwid?' &&
            glyphRef[0] !== 'vpwid?') {
          throw new Error (["No |"+glyphRef[0]+"| for " + glyphId, glyphRef]);
        }
        // XXX palt
        
        let glyph = copyGlyph (inFonts[glyphRef[1]], glyphId2, df, {
          reHeight: inFonts[glyphRef[1]].reHeight,
          reWidth: inFonts[glyphRef[1]].reWidth,
        });
        let gid = df.glyphs.length;
        df.glyphs.push (glyph);
        code (glyph);
        return gid;
      } else if (glyphRef[0] === 'height2v' || glyphRef[0] === 'height3v' ||
                 glyphRef[0] === 'height4v') {
        var glyphId = inFonts[glyphRef[1]].unicodeCmap.glyphIndexMap[glyphRef[2]];
        let glyphId2 = applyFeature (inFonts[glyphRef[1]], 'vert', glyphId);
        if (glyphId === glyphId2) {
          throw new Error (["No |"+glyphRef[0]+"| for " + glyphId, glyphRef]);
        }
        
        let glyph = copyGlyph (inFonts[glyphRef[1]], glyphId2, df, {
          reHeight: inFonts[glyphRef[1]].reHeight,
          reWidth: inFonts[glyphRef[1]].reWidth,
          scaleY: (glyphRef[0] === 'height4v' ? 4 : glyphRef[0] === 'height3v' ? 3 : 2),
        });
        let gid = df.glyphs.length;
        df.glyphs.push (glyph);
        code (glyph);
        return gid;
      } else if (glyphRef[0] === 'voiced' || glyphRef[0] === 'semivoiced') {
        let glyphId = inFonts[glyphRef[1]].unicodeCmap.glyphIndexMap[glyphRef[2]];
        let glyphId1 = inFonts[glyphRef[1]].unicodeCmap.glyphIndexMap[{
          voiced: 0x3099,
          semivoiced: 0x309A,
        }[glyphRef[0]]];
        if (!glyphId) throw new Error (`Glyph ${glyphId} for U+${glyphRef[2].toString (16).toUpperCase ().padStart ('0', 4)} (${glyphRef[2]}) not defined`);
        if (!glyphId1) throw new Error (`Glyph ${glyphId1} not defined`);
        let glyphId2 = applyLigFeature (inFonts[glyphRef[1]], "ccmp", glyphId, glyphId1);
        if (glyphId === glyphId2) {
          throw new Error (["No |"+glyphRef[0]+"| for " + glyphId, glyphRef]);
        }
        
        let glyph = copyGlyph (inFonts[glyphRef[1]], glyphId2, df, {
          reHeight: inFonts[glyphRef[1]].reHeight,
          reWidth: inFonts[glyphRef[1]].reWidth,
        });
        let gid = df.glyphs.length;
        df.glyphs.push (glyph);
        code (glyph);
        return gid;
      } else if (glyphRef[0] === 'gwnames' ||
                 ({
                   largeof: true,
                   smallof: true,
                   vrt2of: true,
                   //bsquared: true, rsquared: true, rbsquared: true,
                 }[glyphRef[0]] && glyphRef[1] === 'gw')) {
        let glyphId = inFonts[glyphRef[1]].names.indexOf (glyphRef[2]);
        if (glyphId === -1) throw new Error ('Unknown glyph name |'+glyphRef[2]+'|');
        let glyph = copyGlyph (inFonts[glyphRef[1]], glyphId + 1, df, {
          reHeight: true,
          large: glyphRef[0] === 'largeof',
          small: glyphRef[0] === 'smallof',
          vrt2: glyphRef[0] === 'vrt2of',
        });
        // GlyphWiki background (black) glyph data
        let bg;
        if (/^aj1-10(?:5[1-9][0-9]|6[0-9][0-9]|7[0-5][0-9]|76[012])$/.test (glyphRef[2])) {
          bg = "123.2 13.4 137.9 18.8 151.5 26.6 163.5 36.7 173.5 48.7 181.3 62.2 186.7 76.9 189.4 92.4 189.4 108 186.7 123.4 181.3 138.1 173.5 151.7 163.5 163.7 151.5 173.7 137.9 181.6 123.2 186.9 107.8 189.6 92.1 189.6 76.7 186.9 62 181.6 48.4 173.7 36.4 163.7 26.4 151.7 18.6 138.1 13.2 123.4 10.5 108 10.5 92.4 13.2 76.9 18.6 62.2 26.4 48.7 36.4 36.7 48.4 26.6 62 18.8 76.7 13.4 92.1 10.7 107.8 10.7".split (/ /g);
        } else if (/^aj1-11(?:57[6-9]|5[89][0-9]|[67][0-9][0-9]|8[0-3][0-9]|84[0-5])$/.test (glyphRef[2])) {
          bg = "176.9 15.1 178.8 15.7 180.5 16.6 182 17.9 183.3 19.4 184.2 21.1 184.8 23 185 25 185 175 184.8 176.9 184.2 178.8 183.3 180.5 182 182 180.5 183.3 178.8 184.2 176.9 184.8 175 185 25 185 23 184.8 21.1 184.2 19.4 183.3 17.9 182 16.6 180.5 15.7 178.8 15.1 176.9 15 175 15 25 15.1 23 15.7 21.1 16.6 19.4 17.9 17.9 19.4 16.6 21.1 15.7 23 15.1 25 15 175 15".split (/ /g);
        } else if (/^aj1-11(?:03[7-9]|0[4-9][0-9]|[12][0-9][0-9]|30[0-5])$/.test (glyphRef[2])) {
          bg = "185 185 15 185 15 15 185 15".split (/ /g);
        }
        if (bg) {
          let r = df.upem / 200;
          let y = df.descender;
          glyph.path.moveTo (bg.shift () * r, bg.shift () * r + y);
          while (bg.length) {
            glyph.path.lineTo (bg.shift () * r, bg.shift () * r + y);
          }
          glyph.topSideBearing = glyph.advanceHeight + df.descender - glyph.getMetrics ().yMax;
        }
        if (/-halfwidth|uff6[6-9a-f]|uff[789][0-9a-f]|uff9[0-f]|u201[89]|u02c0/.test (glyphRef[2])) {
          if (glyphRef[0] === 'vrt2of') {
            glyph.advanceHeight /= 2;
            glyph.topSideBearing -= df.upem/2;
          } else {
            glyph.advanceWidth /= 2;
          }
        }
        let gid = df.glyphs.length;
        df.glyphs.push (glyph);
        code (glyph);
        return gid;
      } else if (glyphRef[0] === 'glyphpaths' ||
                 {
                   vrt2of: glyphRef[1] === 'eg',
                   markrtof: glyphRef[1] === 'ep',
                   //bsquared: true, rsquared: true, rbsquared: true,
                 }[glyphRef[0]]) {
        let paths = inFonts[glyphRef[1]].getGlyphPaths (glyphRef[2], df.upem, df.ascender, df.descender);
        if (paths == null) throw new Error ('Unknown glyph name |'+glyphRef[2]+'|');
        let path = paths[0];
        let redPath = path.redPath;

        let topSideBearing;
        if (path.isDH) {
          let path2 = new opentype.Path;
          let minY = Infinity;
          path.commands.forEach (cmd => {
            let { x, y } = cmd;
            if (y !== undefined) {
              y = 3 * df.upem - df.descender + 2 * (y - df.ascender);
              if (y < minY) minY = y;
            }
            path2.commands.push ({...cmd, x, y});
          });
          topSideBearing = df.upem + df.ascender - minY;
          path2.isDH = path.isDH;
          path = path2;
        }
        if (path.isH15) {
          let path2 = new opentype.Path;
          let minY = Infinity;
          path.commands.forEach (cmd => {
            let { x, y } = cmd;
            if (y !== undefined) {
              y = 3 * df.upem - df.descender + 1.5 * (y - df.ascender);
              if (y < minY) minY = y;
            }
            path2.commands.push ({...cmd, x, y});
          });
          topSideBearing = df.upem + df.ascender - minY;
          path2.isH15 = path.isH15;
          path = path2;
        }
        if (path.isTH) {
          let path2 = new opentype.Path;
          let minY = Infinity;
          path.commands.forEach (cmd => {
            let { x, y } = cmd;
            if (y !== undefined) {
              y = 3 * df.upem - df.descender + 3 * (y - df.ascender);
              if (y < minY) minY = y;
            }
            path2.commands.push ({...cmd, x, y});
          });
          topSideBearing = df.upem + df.ascender - minY;
          path2.isTH = path.isTH;
          path = path2;
        }
        if (path.isDW) {
          let path2 = new opentype.Path;
          path.commands.forEach (cmd => {
            let { x, y } = cmd;
            if (x !== undefined) {
              x *= 2;
            }
            path2.commands.push ({...cmd, x, y});
          });
          path2.isDW = path.isDW;
          path = path2;
        }
        if (path.isTW) {
          let path2 = new opentype.Path;
          path.commands.forEach (cmd => {
            let { x, y } = cmd;
            if (x !== undefined) {
              x *= 3;
            }
            path2.commands.push ({...cmd, x, y});
          });
          path2.isTW = path.isTW;
          path = path2;
        }

        if (glyphRef[0] === 'vrt2of') {
          let path2 = new opentype.Path;
          let deltaX = df.descender;
          for (const cmd of path.commands) {
            const { type, x, y, x1, y1, x2, y2 } = cmd;
            if (type === 'M' || type === 'L') {
              path2[type === 'M' ? 'moveTo' : 'lineTo'](y + deltaX, -x);
            } else if (type === 'C') {
              path2.curveTo(y1 + deltaX, -x1, y2 + deltaX, -x2, y + deltaX, -x);
            } else if (type === 'Q') {
              path2.quadTo(y1 + deltaX, -x1, y + deltaX, -x);
            } else if (type === 'Z') {
              path2.closePath();
            }
          }
          path2.isHW = path.isHW;
          path = path2;
        }

        if (glyphRef[0] === 'markrtof') {
          let w = path._aw/4;
          let _ = (x, y) => [x/4 + df.upem - w,
                             (y - df.descender) / 4 + df.upem * 3/4 + df.descender];
          let path2 = new opentype.Path;
          for (const cmd of path.commands) {
            const { type, x, y, x1, y1, x2, y2 } = cmd;
            if (type === 'M' || type === 'L') {
              path2[type === 'M' ? 'moveTo' : 'lineTo'](..._ (x, y));
            } else if (type === 'C') {
              path2.curveTo (..._ (x1, y1), ..._ (x2, y2), ..._ (x, y));
            } else if (type === 'Q') {
              path2.quadTo (..._ (x1, y1), ..._ (x, y));
            } else if (type === 'Z') {
              path2.closePath ();
            }
          }
          path = path2;
          path._aw = df.upem;
          path._ah = df.upem;
          path._tsb = topSideBearing = null;
        }

        let glyph = new opentype.Glyph ({
          name: glyphRef[2],
          advanceWidth: df.upem * (path.isHW ? 0.5 : path.isDW ? 2 : path.isTW ? 3 : 1),
          advanceHeight: df.upem * (path.isHH ? 0.5 : path.isDH ? 2 : path.isTH ? 3 : path.isH15 ? 1.5 : 1),
          topSideBearing,
          path,
        });
        if (path._aw != null) glyph.advanceWidth = path._aw;
        if (path._ah != null) glyph.advanceHeight = path._ah;
        if (path._tsb != null) topSideBearing = glyph.topSideBearing = path._tsb;
        if (topSideBearing == null) {
          topSideBearing = glyph.topSideBearing = glyph.advanceHeight + df.descender - glyph.getMetrics ().yMax;
        }

        if (glyphRef[0] === 'vrt2of') {
          glyph.topSideBearing -= df.upem/2;
          if (path.isHW) {
            glyph.advanceHeight /= 2;
            glyph.topSideBearing -= df.upem/2;
          }
        }
        
        let gid = df.glyphs.length;
        df.glyphs.push (glyph);
        if (path.isRed) df.isRed[gid] = true;
        code (glyph);

        if (paths.length > 1) {
          let gids = [gid];
          for (let i = 1; i < paths.length; i++) {
            let p = paths[i];
            let glyph = new opentype.Glyph ({
              advanceWidth: p._aw,
              advanceHeight: p._ah,
              topSideBearing: p._tsb,
              path: p,
            });
            
            let gid = df.glyphs.length;
            df.glyphs.push (glyph);
            code (glyph);
            gids.push (gid);
          }

          df.splitted[gid] = gids;
        } // paths > 1
        
        if (redPath) {
          let glyph = new opentype.Glyph ({
            name: glyphRef[2] + '.red',
            advanceWidth: df.upem * (path.isHW ? 0.5 : path.isDW ? 2 : path.isTW ? 3 : 1),
            advanceHeight: df.upem * (path.isHH ? 0.5 : path.isDH ? 2 : path.isTH ? 3 : path.isH15 ? 1.5 : 1),
            topSideBearing,
            path: path.redPath,
          });

          let gid2 = df.glyphs.length;
          df.glyphs.push (glyph);
          code (glyph);
          df.withRed[gid] = gid2;
        }
        return gid;
      } else if (glyphRef[0] === 'ex') {
        if (glyphRef[2] === 'ex20001' ||
            glyphRef[2] === 'ex20002' ||
            glyphRef[2] === 'ex20003') {
          if (inFonts.kiri) {
            let glyph = copyGlyph (inFonts.kiri, 23291, df, {
              deltaY: {
                ex20003: 0,
              }[glyphRef[2]],
              scaleY: {
                ex20001: 4,
                ex20002: 8,
                ex20003: 16,
              }[glyphRef[2]],
            });
            let gid = df.glyphs.length;
            df.glyphs.push (glyph);
            code (glyph);
            return gid;
          }
        } else {
          throw new Error ("Bad " + glyphRef[2]);
        }
      } else if ({
        square2: true, square2v: true,
        square3: true, square3v: true,
        square3c: true, square3cv: true,
        square4: true, square4v: true,
        square5: true, square5v: true,
        square6: true, square6v: true,
        square6c: true, square6bv: true,
      }[glyphRef[0]] && glyphRef[1] === 'gw') {
        let glyphs = [];
        for (let _ of glyphRef[2]) {
          let glyphId = inFonts[glyphRef[1]].names.indexOf (_);
          if (glyphId === -1) throw new Error ('Unknown glyph name |'+_+'|');
          let glyph = copyGlyph (inFonts[glyphRef[1]], glyphId + 1, df, {
          });
          glyphs.push (glyph);
        }

        let path2 = new opentype.Path;
        if (glyphRef[0] === 'square2') {
          copy (path2, glyphs[0].path, 0, df.upem/2, 0.5, 0.5);
          copy (path2, glyphs[1].path, df.upem/2, 0, 0.5, 0.5);
        } else if (glyphRef[0] === 'square2v') {
          copy (path2, glyphs[0].path, df.upem/2, df.upem/2, 0.5, 0.5);
          copy (path2, glyphs[1].path, 0, 0, 0.5, 0.5);
        } else if (glyphRef[0] === 'square3') {
          copy (path2, glyphs[0].path, 0, df.upem/2, 0.5, 0.5);
          copy (path2, glyphs[1].path, df.upem/2, df.upem/2, 0.5, 0.5);
          copy (path2, glyphs[2].path, 0, 0, 0.5, 0.5);
        } else if (glyphRef[0] === 'square3v') {
          copy (path2, glyphs[0].path, df.upem/2, df.upem/2, 0.5, 0.5);
          copy (path2, glyphs[1].path, df.upem/2, 0, 0.5, 0.5);
          copy (path2, glyphs[2].path, 0, df.upem/2, 0.5, 0.5);
        } else if (glyphRef[0] === 'square3c') {
          copy (path2, glyphs[0].path, 0, df.upem/2, 0.5, 0.5);
          copy (path2, glyphs[1].path, df.upem/2, df.upem/2, 0.5, 0.5);
          copy (path2, glyphs[2].path, df.upem/4, 0, 0.5, 0.5);
        } else if (glyphRef[0] === 'square3cv') {
          copy (path2, glyphs[0].path, df.upem/2, df.upem/2, 0.5, 0.5);
          copy (path2, glyphs[1].path, df.upem/2, 0, 0.5, 0.5);
          copy (path2, glyphs[2].path, 0, df.upem/4, 0.5, 0.5);
        } else if (glyphRef[0] === 'square4') {
          copy (path2, glyphs[0].path, 0, df.upem/2, 0.5, 0.5);
          copy (path2, glyphs[1].path, df.upem/2, df.upem/2, 0.5, 0.5);
          copy (path2, glyphs[2].path, 0, 0, 0.5, 0.5);
          copy (path2, glyphs[3].path, df.upem/2, 0, 0.5, 0.5);
        } else if (glyphRef[0] === 'square4v') {
          copy (path2, glyphs[0].path, df.upem/2, df.upem/2, 0.5, 0.5);
          copy (path2, glyphs[1].path, df.upem/2, 0, 0.5, 0.5);
          copy (path2, glyphs[2].path, 0, df.upem/2, 0.5, 0.5);
          copy (path2, glyphs[3].path, 0, 0, 0.5, 0.5);
        } else if (glyphRef[0] === 'square5') {
          copy (path2, glyphs[0].path, 0, df.upem/2, 0.5, 0.5);
          copy (path2, glyphs[1].path, df.upem/2, df.upem/2, 0.5, 0.5);
          copy (path2, glyphs[2].path, 0, 0, 1/3, 0.5);
          copy (path2, glyphs[3].path, df.upem/3, 0, 1/3, 0.5);
          copy (path2, glyphs[4].path, df.upem*2/3, 0, 1/3, 0.5);
        } else if (glyphRef[0] === 'square5v') {
          copy (path2, glyphs[0].path, df.upem/2, df.upem/2, 0.5, 0.5);
          copy (path2, glyphs[1].path, df.upem/2, 0, 0.5, 0.5);
          copy (path2, glyphs[2].path, 0, df.upem*2/3, 0.5, 1/3);
          copy (path2, glyphs[3].path, 0, df.upem/3, 0.5, 1/3);
          copy (path2, glyphs[4].path, 0, 0, 0.5, 1/3);
        } else if (glyphRef[0] === 'square6') {
          copy (path2, glyphs[0].path, 0, df.upem/2, 1/3, 0.5);
          copy (path2, glyphs[1].path, df.upem/3, df.upem/2, 1/3, 0.5);
          copy (path2, glyphs[2].path, df.upem*2/3, df.upem/2, 1/3, 0.5);
          copy (path2, glyphs[3].path, 0, 0, 1/3, 0.5);
          copy (path2, glyphs[4].path, df.upem/3, 0, 1/3, 0.5);
          copy (path2, glyphs[5].path, df.upem*2/3, 0, 1/3, 0.5);
        } else if (glyphRef[0] === 'square6v') {
          copy (path2, glyphs[0].path, df.upem/2, df.upem*2/3, 0.5, 1/3);
          copy (path2, glyphs[1].path, df.upem/2, df.upem/3, 0.5, 1/3);
          copy (path2, glyphs[2].path, df.upem/2, 0, 0.5, 1/3);
          copy (path2, glyphs[3].path, 0, df.upem*2/3, 0.5, 1/3);
          copy (path2, glyphs[4].path, 0, df.upem/3, 0.5, 1/3);
          copy (path2, glyphs[5].path, 0, 0, 0.5, 1/3);
        } else if (glyphRef[0] === 'square6c') {
          copy (path2, glyphs[0].path, 0, df.upem/2, 0.5, 0.5);
          copy (path2, glyphs[1].path, df.upem/2, df.upem/2, 0.5, 0.5);
          copy (path2, glyphs[2].path, 0, 0, 0.25, 0.5);
          copy (path2, glyphs[3].path, df.upem/4, 0, 0.25, 0.5);
          copy (path2, glyphs[4].path, df.upem*2/4, 0, 0.25, 0.5);
          copy (path2, glyphs[5].path, df.upem*3/4, 0, 0.25, 0.5);
        } else if (glyphRef[0] === 'square6bv') {
          copy (path2, glyphs[0].path, df.upem/2, df.upem*2/3, 0.5, 1/3);
          copy (path2, glyphs[1].path, df.upem/2, df.upem/3, 0.5, 1/3);
          copy (path2, glyphs[2].path, 0, df.upem*3/4, 0.5, 0.25);
          copy (path2, glyphs[3].path, 0, df.upem*2/4, 0.5, 0.25);
          copy (path2, glyphs[4].path, 0, df.upem/4, 0.5, 0.25);
          copy (path2, glyphs[5].path, 0, 0, 0.5, 0.25);
        }
        
        let glyph = new opentype.Glyph ({
          advanceWidth: df.upem,
          advanceHeight: df.upem,
          path: path2,
        });
        glyph.topSideBearing = glyph.advanceHeight + df.descender - glyph.getMetrics ().yMax;
        
        let gid = df.glyphs.length;
        df.glyphs.push (glyph);
        code (glyph);
        return gid;
      } else if (glyphRef[0] === 'dummy') {
        let path = new opentype.Path;
        let glyph = new opentype.Glyph ({
          advanceWidth: 0,
          advanceHeight: 0,
          topSideBearing: 0,
          path,
        });
        let gid = df.glyphs.length;
        df.glyphs.push (glyph);
        code (glyph);
        return gid;
      } else if (glyphRef[0] === '_quarter') {
        let path2 = new opentype.Path;
        copy (path2, glyphRef[2], -(df.upem/8 * 3/2 / 2) + df.upem/4, 0, 3/2 / 2, 3/2 / 2);
        let glyph = new opentype.Glyph ({
          advanceWidth: df.upem,
          advanceHeight: df.upem,
          path: path2,
        });
        glyph.topSideBearing = glyph.advanceHeight + df.descender - glyph.getMetrics ().yMax;
        
        let gid = df.glyphs.length;
        df.glyphs.push (glyph);
        code (glyph);
        return gid;

      } else {
        throw new Error ("Bad " + glyphRef[0]);
      }
    }; // insertGlyphByRef

    let gidMap = [];
    let gidMapQ = [];
    let gidGlyph = [];
    let classes = {};
    let replaces = {};
    let expands = {};
    let ligs = {};
    {
      let added = [];
      Object.keys (opts.defs.classes).forEach (c => {
        Object.keys (opts.defs.classes[c] || {}).forEach (i => {
          if (opts.defs.glyphs[i]) gidMap[i] = insertGlyphByRef (opts.defs.glyphs[i], glyph => {
            gidGlyph[i] = glyph;
          }, {});
          added[i] = true;
        });
      });
      for (let i in opts.defs.glyphs) {
        if (!added[i] && opts.defs.glyphs[i]) gidMap[i] = insertGlyphByRef (opts.defs.glyphs[i], glyph => {
          gidGlyph[i] = glyph;
        }, {});
      }
      classes.small_quarter = [];
      replaces.SMLQ = [];
      Object.keys (opts.defs.classes.small_normal || {}).forEach (i => {
        if (!gidGlyph[i]) return;
        let gid = replaces.SMLQ[gidMap[i]] = insertGlyphByRef (['_quarter', '', gidGlyph[i].path], glyph => {
        }, {});
        gidMapQ[i] = gid;
        classes.small_quarter[gid] = true;
      });

      Object.keys (opts.defs.cmap).forEach (code => {
        let gid = opts.defs.cmap[code];
        if (!gidGlyph[gid]) {
          console.log (`Glyph |${gid}| for U+${parseInt (code).toString(16).padStart(4, '0').toUpperCase()} (${code}) not defined`);
        }
        gidGlyph[gid].addUnicode (parseInt (code));
      });
    }

    {
      ['normal', 'basespace', 'with_rt', 'halfwidth',
       'mark_rt', 'mark_rb', 'mark_cb', 'mark_lb', 'mark_lm', 'mark_lt', 'mark_ct',
       'modr', 'modl', 'modtw', 'tsu',
       'small_normal',
       //'small_quarter',
       'small_operators', 'feature_operators'].forEach (c => {
        classes[c] = [];
        Object.keys (opts.defs.classes[c] || {}).forEach (_ => {
          classes[c][gidMap[_]] = true;
        });
       });
      classes.seqIn = [];
      classes.seqLast = [];
      classes.zwj = [];
      classes.marks = [];
      ['mark_rt', 'mark_rb', 'mark_cb', 'mark_lb', 'mark_lm', 'mark_lt', 'mark_ct'].forEach (c => {
        Object.keys (opts.defs.classes[c] || {}).forEach (_ => {
          classes.marks[gidMap[_]] = true;
        });
      });
      classes.others = [];
      G: for (let i in opts.defs.glyphs) {
        let gid = gidMap[i];
        for (let n of ['normal', 'basespace', 'with_rt', 'marks', 'halfwidth']) {
          if (classes[n][gid]) {
            continue G;
          }
        }
        classes.others[gid] = true;
      }
      
      let ccmps = [];
      ["de"].forEach (i => {
        ccmps[i] = [];
        opts.defs.ccmp[i]?.forEach (_ => {
          let gid1 = gidMap[_[0]];
          let components = _[1].map (_ => gidMap[_]);

          ccmps[i][gid1] = components;
        });
      });
      ["con", "smal2", "cmb2", "cmb3", "cmb4", "main", "fin", "last"].forEach (i => {
        ccmps[i] = [];
        opts.defs.ccmp[i]?.sort ((a, b) => b[0].length - a[0].length).forEach (_ => {
          let components = _[0].map (_ => gidMap[_]);
          let gid1 = components.shift ();
          let gid2 = gidMap[_[1]];
        
          if (!ccmps[i][gid1]) ccmps[i][gid1] = [];
          ccmps[i][gid1].push ({components, ligatureGlyph: gid2});

          if (gidMapQ[_[1]]) {
            let components = _[0].map (_ => gidMapQ[_] || gidMap[_]);
            let gid1 = components.shift ();
            let gid2 = gidMapQ[_[1]] || gidMap[_[1]];
            if (!ccmps[i][gid1]) ccmps[i][gid1] = [];
            ccmps[i][gid1].push ({components, ligatureGlyph: gid2});
          }
        });
      });

      let SQAR = [];
      (opts.defs.SQAR || []).sort ((a, b) => b[0].length - a[0].length).forEach (_ => {
        let gid1 = gidMap[_[0].shift ()];
        let components = _[0].map (_ => gidMap[_]);
        let gid2 = gidMap[_[1]];
        
        if (!SQAR[gid1]) SQAR[gid1] = [];
        SQAR[gid1].push ({components, ligatureGlyph: gid2});
      });
      
      [
        'WHIT', 'SANB', 'LARG', 'SMSM',
        'hkna', 'vkna', 'ruby',
      ].forEach (f => {
        replaces[f] = [];
        Object.keys (opts.defs[f] || {}).forEach (_ => {
          let gid1 = gidMap[_];
          let gid2 = gidMap[opts.defs[f][_]];
          replaces[f][gid1] = gid2;
        });
      });
      [
        'SMLB', 'SMCB', 'SMRB', 'SMLM', 'SMCM', 'SMRM',
        'SMLT', 'SMCT', 'SMRT',
        'SMPB', 'SMPM', 'SMPT', 'SMLP', 'SMCP', 'SMRP',
        'SMLO', 'SMLQ',
        'vert', 'WDLT', 'WDRT', 'vrt2', 'rtla',
        'pwid',
      ].forEach (f => {
        replaces[f] = replaces[f] || [];
        Object.keys ((opts.defs.replaces || {})[f] || {}).forEach (_ => {
          let gid1 = gidMap[_];
          let gid2 = gidMap[opts.defs.replaces[f][_]];
          replaces[f][gid1] = gid2;
        });
      });
      replaces.hwid = [];
      replaces.fwid = [];
      Object.keys ((opts.defs.replaces || {}).hwid || {}).forEach (_ => {
        let gid1 = gidMap[_];
        let gid2 = gidMap[opts.defs.replaces.hwid[_]];
        replaces.hwid[gid1] = gid2;
        replaces.fwid[gid2] = gid1;
      });
      expands.SMAL = [];
      Object.keys (opts.defs.SMAL || {}).forEach (_ => {
        let gid1 = gidMap[_];
        let gid2 = gidMap[opts.defs.SMAL[_]];
        let gid3 = gidMap[opts.defs.named_glyphs.small_modifier_l];
        expands.SMAL[gid1] = [gid2, gid3];
      });

      replaces.inchain1 = [];
      replaces.inchain2 = [];
      replaces.inchain3 = [];
      {
        let g0 = gidMap[opts.defs.cmap[0x30FC]];
        let g1 = gidMap[opts.defs.named_glyphs["ー-h-first"]];
        let g2 = gidMap[opts.defs.named_glyphs["ー-h-middle"]];
        let g3 = gidMap[opts.defs.named_glyphs["ー-h-last"]];
        let g10 = gidMap[replaces.vert[opts.defs.cmap[0x30FC]]];
        let g11 = gidMap[opts.defs.named_glyphs["ー-h-first"]];
        let g12 = gidMap[opts.defs.named_glyphs["ー-h-middle"]];
        let g13 = gidMap[opts.defs.named_glyphs["ー-h-last"]];
        replaces.inchain1[g0] = g3;
        replaces.inchain2[g0] = g1;
        replaces.inchain3[g3] = g2;
        replaces.inchain1[g10] = g13;
        replaces.inchain2[g10] = g11;
        replaces.inchain3[g13] = g12;
        classes.seqIn[g0] = true;
        classes.seqIn[g10] = true;
        classes.seqIn[g3] = true;
        classes.seqIn[g13] = true;
        classes.seqLast[g3] = true;
        classes.seqLast[g13] = true;
        classes.zwj[gidMap[opts.defs.cmap[0x200D]]] = true;
        classes.zwj[gidMap[opts.defs.cmap[0x034F]]] = true;
      }

      let variants = {};
      opts.defs.variant_tags.forEach (tag => {
        variants[tag] = [];
        Object.keys (opts.defs[tag]).forEach (_ => {
          {
            let gid1 = gidMap[_];
            let gid2 = gidMap[opts.defs[tag][_]];
            variants[tag][gid1] = gid2;
          }
          {
            let gid1 = gidMapQ[_] || gidMap[_];
            let gid2 = gidMapQ[opts.defs[tag][_]] || gidMap[opts.defs[tag][_]];
            variants[tag][gid1] = gid2;
          }
        });
      });

      let KanaScriptFeats = ['HIRA', 'KATA'];
      let NonKanaScriptFeats = [
        'KRTR', 'KNNA', 'MRTN', 'AHIR', 'HTMA', 'AWAM', 'KIBK', 
        'KTDM', 'ANIT', 'TYKN', 'TYKO', 'HSMI', 'IZMO', 'KIBI', 'TNKS',
        'TATU', 'AHKS', 'NKTM', 'IRHO', 'NANC', 'UMAS', 'TUSM', 'KAMI',
        'RUKU', 'HNDE', 'TAYM', 'MROK',
        'OCRF',
      ];
      let ScriptFeats = [...KanaScriptFeats, ...NonKanaScriptFeats];
      ScriptFeats.forEach (f => {
        ligs[f] = [];
        replaces[f] = [];
      });
      replaces.KMOD = [];
      let mk = {};
      ScriptFeats.forEach (feat => {
        ((opts.defs.ligatures || {})[feat] || []).sort ((a, b) => b[0].length - a[0].length).forEach (_ => {
          let gid1 = gidMap[_[0].shift ()];
          let components = _[0].map (_ => gidMap[_]);
          let gid3 = gidMap[_[1]];
          let gids2 = _[2].map (_ => gidMap[_]);
          if (!gid1 || !gid3) throw new Error ("Bad glyph ID", console.log (feat, _, gid1, gids2, gid3));
          
          if (!ligs[feat][gid1]) ligs[feat][gid1] = [];
          ligs[feat][gid1].push ({components, ligatureGlyph: gid3, ligGlyph: gid3});
          replaces[feat][gid3] = gids2;
        });
        Object.keys (opts.defs[feat] || {}).forEach (_ => {
          let gid1 = gidMap[_];
          if (!gid1) throw new Error ([feat, _, gid1]);
          let list = opts.defs[feat][_].map (_ => gidMap[_]);
          if (list.length === 1 && list[0] === gid1) {
            //
          } else {
            replaces[feat][gid1] = list;
          }
        });
      });
      Object.keys (opts.defs.KMOD || {}).forEach (_ => {
        let gid1 = gidMap[_];
        let list = opts.defs.KMOD[_].map (_ => gidMap[_]);
        if (list.length === 1 && list[0] === gid1) {
          //
        } else {
          replaces.KMOD[gid1] = list;
        }
      });
      ['MKRT', 'MKRM', 'MKRB', 'MKCB', 'MKLB', 'MKLM', 'MKLT', 'MKCT',
       'MKCM'].forEach (f => {
        mk[f] = [];
        Object.keys (opts.defs[f] || {}).forEach (_ => {
          let gid1 = gidMap[_];
          let list = opts.defs[f][_].map (_ => gidMap[_]);
          if (list.length === 1 && list[0] === gid1) {
            //
          } else {
            mk[f][gid1] = list;
          }
        });
       });
      replaces["ccmps.dummy"] = [];
      replaces["ccmps.dummy"][gidMap[opts.defs.named_glyphs.SMAL]]
        = gidMap[opts.defs.named_glyphs.dummy];
      replaces["ccmps.dummy"][gidMap[opts.defs.named_glyphs.hwid]]
        = gidMap[opts.defs.named_glyphs.dummy];
      
      let salt = [];
      Object.keys (opts.defs.salt || {}).forEach (_ => {
        {
          let gid1 = gidMap[_];
          let list = opts.defs.salt[_].map (_ => gidMap[_]);
          if (list.length === 0) {
            //
          } else if (list.length === 1 && list[0] === gid1) {
            //
          } else {
            salt[gid1] = list;
          }
        }
        {
          let gid1 = gidMapQ[_] || gidMap[_];
          let list = opts.defs.salt[_].map (_ => gidMapQ[_] || gidMap[_]);
          if (list.length === 0) {
            //
          } else if (list.length === 1 && list[0] === gid1) {
            //
          } else {
            salt[gid1] = list;
          }
        }
      });

      let license = [opts.licenseText].concat (Object.keys (inFonts).sort ((a, b) => a-b).filter (_ => _ !== 'base').map (_ => {
        let legal = inFonts[_].legal || {};
        return [
          legal.name, legal.license, legal.licenseURL, legal.copyright, legal.trademark,
          legal.licenseAdditionalText,
          legal.licenseSourceWebSite ? 'Source Web Site : <' + legal.licenseSourceWebSite + '>' : null,
        ].filter (_ => _ != null && /\S/.test (_)).join ("\n\n");
      })).join ("\n\n----\n\n");
      // license.length's max ~ (16200, 16300)

      let nameTable;
      let fontFamily = opts.fontName;
      let fontSubfamily = 'Regular';
      let postScriptName;
      let fontVersion = '1.0';
      {
        let full = fontFamily + ' ' + fontSubfamily;
        postScriptName = fontFamily.replace (/[^A-Za-z0-9]/g, '') + '-'
            + fontSubfamily.replace (/[^A-Za-z0-9]/g, '');

        let otw = new OTWriter;

        let records = [];
        let strings = [];
        {
          function utf16be (str) {
            let buf = [];
            for (let c of str) {
              let code = c.charCodeAt (0);
              buf.push (code >> 8, code & 0xFF);
            }
            return buf;
          } // utf16be
          
          function addName (nameID, text) {
            let data = utf16be (text);
            let offset = strings.length;
            strings.push (...data);
            records.push ({
              nameID,
              length: data.length,
              offset,
            });
          } // addName

          addName (1, fontFamily); // Font family
          addName (2, fontSubfamily); // Font subfamily
          addName (4,  full); // Full name
          addName (5, fontVersion); // Version
          addName (6, postScriptName); // PostScript name
          addName (16, fontFamily); // Typographic family
          addName (17, fontSubfamily); // Typographic subfamily
          addName (13, license); // License
          addName (14, opts.licenseURL); // License URL
        }

        let stringStorage = [];
        let table = otw.startTable ([]);
        otw.add ([
          ['uint16', 0], // format
          ['uint16', records.length], // count
          table.offset16 (stringStorage, ['name', 'stringOffset']),
        ]);
        for (let r of records) {
          otw.add ([
            ['uint16', 3], // platformID (Windows)
            ['uint16', 1], // encodingID (Unicode)
            ['uint16', 0x0409], // languageID (en-US)
            ['uint16', r.nameID],
            ['uint16', r.length],
            ['uint16', r.offset],
          ]);
        }

        let sTable = otw.startTable (stringStorage);
        otw.addArrayBuffer (Uint8Array.from (strings)); // string storage

        nameTable = otw.getArrayBufferList ();
      }

      let font = new opentype.Font ({
        familyName: fontFamily,
        styleName: fontSubfamily,
        postScriptName,

        unitsPerEm: df.upem,
        ascender: df.ascender,
        descender: df.descender,
        glyphs: df.glyphs,

        tables: {
          name: {arrayBufferList: nameTable},
        },
      });

      font.tables.os2.fsSelection |= 128; // USE_TYPO_METRICS

      {
        let otw = new OTWriter;
        let table = otw.startTable ([]);
        let rs0 = [];
        let rs4 = [];
        otw.add ([
          ['uint16', 1], // majorVersion
          ['uint16', 2], // minorVersion
          table.offset16 (rs0, ['GDEF', 'glyphClassDefOffset']),
          ['uint16', 0], // attachListOffset
          ['uint16', 0], // ligCaretListOffset
          ['uint16', 0], // markAttachClassDefOffset
          table.offset16 (rs4, ['GDEF', 'markGlyphSetDefOffset']),
        ]);
        otw.addClassDefForMarks ([classes.marks, classes.small_operators,
                                  classes.feature_operators], rs0);
        {
          let subtable = otw.startTable (rs4);
          let srs0 = [];
          let srs1 = [];
          let srs2 = [];
          let srs3 = [];
          otw.add ([
            ['uint16', 1], // format
            ['uint16', 4], // markGlyphSetCount
            subtable.offset32 (srs0, ['GDEF', 'markGlyphSetDefOffset', 'coverageOffsets[0]']),
            subtable.offset32 (srs1, ['GDEF', 'markGlyphSetDefOffset', 'coverageOffsets[1]']),
            subtable.offset32 (srs2, ['GDEF', 'markGlyphSetDefOffset', 'coverageOffsets[2]']),
            subtable.offset32 (srs3, ['GDEF', 'markGlyphSetDefOffset', 'coverageOffsets[3]']),
          ]);
          // Sets of target mark glyphs in GSUB and GPOS lookups
          //
          // markFilteringSet 0
          otw.addCoverage ([classes.marks], srs0);
          // markFilteringSet 1
          otw.addCoverage ([classes.marks, {[ gidMap[opts.defs.named_glyphs.SMAL] ]: true}], srs1);
          // markFilteringSet 2
          otw.addCoverage ([classes.marks, {[ gidMap[opts.defs.named_glyphs.hwid] ]: true}], srs2);
          // markFilteringSet 3
          otw.addCoverage ([classes.small_operators], srs3);
        }
        font.tables.gdef = {
          arrayBufferList: otw.getArrayBufferList (),
        };
      }

      { // GPOS
        let otw = new OTWriter;
        
        let lookupRefs = [];
        [
            'ccmps.de',
            'ccmps.inchain1', 'ccmps.inchain2', 'ccmps.inchain3',
            'ccmps.chained1', 'ccmps.chained2', 'ccmps.chained3',
            'MKRT', 'MKRM', 'MKRB', 'MKCB', 'MKLB', 'MKLM', 'MKLT', 'MKCT',
            'MKCM',
            'KMOD',
            ...ScriptFeats.map (feat => feat + '.lig'),
            ...ScriptFeats,
            'WHIT', 'SANB', 
            'ccmps.SMAL', 
            'SMAL', 'LARG', 'SMSM',
            'ccmps.hwid', 'ccmps.dummy',
            'hwid', 'fwid',
            'SQAR',
            'vert', 'vrt2', 'WDLT', 'WDRT',
            'rtla',
            'SMLQ',
            'SMLO',
            'SMLB', 'SMCB', 'SMRB', 'SMLM', 'SMCM', 'SMRM',
            'SMLT', 'SMCT', 'SMRT',
            'SMPB', 'SMPM', 'SMPT', 'SMLP', 'SMCP', 'SMRP',
            'pwid',
            'ccmps.smal2',
            'ccmps.cmb4', 'ccmps.cmb3', 'ccmps.cmb2', 'ccmps.main',
            'ccmps.con',
            'ccmps.fin',
            'hkna', 'vkna', 'ruby',
            ...opts.defs.variant_tags, 'salt',
            'ccmps.last',
            'ccmps.splitted',
        ].forEach (key => {
          let ref = {
            labels: ['GSUB', key],
            index: [], table: [],
          };
          lookupRefs.push (ref);
          lookupRefs[key] = ref;
        });
                
        let features = {};
        ScriptFeats.forEach (feat => {
          features[feat] = [
            lookupRefs[feat + '.lig'],
            lookupRefs[feat],
          ];
        });
        [
          'KMOD',
          'MKRT', 'MKRM', 'MKRB', 'MKCB', 'MKLB', 'MKLM', 'MKLT', 'MKCT',
          'MKCM',
          'SMAL', 'LARG', 'SMSM', 'SQAR', 'WDLT', 'WDRT', 'WHIT', 'SANB',
          'SMLQ',
          'SMLB', 'SMCB', 'SMRB', 'SMLM', 'SMCM', 'SMRM',
          'SMLT', 'SMCT', 'SMRT',
            'SMPB', 'SMPM', 'SMPT', 'SMLP', 'SMCP', 'SMRP',
          'SMLO',
          'hwid', 'fwid', 'pwid',
          'hkna', 'vkna', 'ruby',
          'rtla', 'salt', 'vert', 'vrt2',
          ...opts.defs.variant_tags,
        ].forEach (feat => features[feat] = [lookupRefs[feat]]);
        features.ccmp = [
          lookupRefs['ccmps.de'],
          lookupRefs['ccmps.con'],

          lookupRefs['ccmps.SMAL'],
          lookupRefs['ccmps.hwid'],

          lookupRefs['ccmps.chained1'],
          lookupRefs['ccmps.chained2'],
          lookupRefs['ccmps.chained3'],

          lookupRefs['ccmps.smal2'],
          lookupRefs['ccmps.cmb4'],
          lookupRefs['ccmps.cmb3'],
          lookupRefs['ccmps.cmb2'],
          lookupRefs['ccmps.main'],

          lookupRefs['ccmps.fin'],
          lookupRefs['ccmps.last'],
            
          lookupRefs['ccmps.splitted'],
        ];
        
        otw.addGSUB (features, lookupRefs, {});
        
        let codes = [];
        let covRefSets = {seqIn: [], seqLast: [], zwj: [],
                          hasSMAL: [], SMAL: [], hasHwid: [], hwid: []};

        otw.addGSUBMultipleLookup ([{
          map: ccmps.de,
        }], {ref: lookupRefs['ccmps.de']});

        ['MKRT', 'MKRM', 'MKRB', 'MKCB', 'MKLB', 'MKLM', 'MKLT', 'MKCT',
         'MKCM'].forEach (feat => {
          otw.addGSUBAlternateLookup ([{
            map: mk[feat],
          }], {ref: lookupRefs[feat]});
        });
        ['con', 'cmb4', 'cmb3', 'cmb2', 'main', 'last'].forEach (feat => {
          let r = otw.addGSUBLigatureLookup ([{
            map: ccmps[feat],
          }], {ref: lookupRefs['ccmps.' + feat],
               extension: true, markFilteringSet: 0});
          codes.push (r.laters);
        });
        ['smal2'].forEach (feat => {
          let r = otw.addGSUBLigatureLookup ([{
            map: ccmps[feat],
          }], {ref: lookupRefs['ccmps.' + feat],
               extension: true, markFilteringSet: 3});
          codes.push (r.laters);
        });
        
        ['inchain1', 'inchain2', 'inchain3'].forEach (k => {
          let r = otw.addGSUBSingleLookup ([{
            map: replaces[k],
          }], {ref: lookupRefs['ccmps.'+k]});
          codes.push (r.laters);
        });
        otw.addChainedSequenceContextLookup ([{
          backtrackCoverageRefSets: [covRefSets.zwj, covRefSets.seqIn],
          inputCoverageRefSets: [covRefSets.seqIn],
          lookaheadCoverageRefSets: [],
          seqLookups: [{sequenceIndex: 0, ref: lookupRefs["ccmps.inchain1"]}],
        }], {ref: lookupRefs['ccmps.chained1'], GSUB: true});
        otw.addChainedSequenceContextLookup ([{
          backtrackCoverageRefSets: [],
          inputCoverageRefSets: [covRefSets.seqIn, covRefSets.zwj, covRefSets.seqLast],
          lookaheadCoverageRefSets: [],
          seqLookups: [{sequenceIndex: 0, ref: lookupRefs["ccmps.inchain2"]}],
        }], {ref: lookupRefs['ccmps.chained2'], GSUB: true});
        otw.addChainedSequenceContextLookup ([{
          backtrackCoverageRefSets: [],
          inputCoverageRefSets: [covRefSets.seqLast, covRefSets.zwj],
          lookaheadCoverageRefSets: [covRefSets.seqLast],
          seqLookups: [{sequenceIndex: 0, ref: lookupRefs["ccmps.inchain3"]}],
        }], {ref: lookupRefs['ccmps.chained3'], GSUB: true});
        
        otw.addCoverage ([classes.zwj], covRefSets.zwj);
        otw.addCoverage ([classes.seqIn], covRefSets.seqIn);
        otw.addCoverage ([classes.seqLast], covRefSets.seqLast);

        ScriptFeats.forEach (feat => {
          let r = otw.addGSUBLigatureLookup ([{
            map: ligs[feat],
          }], {ref: lookupRefs[feat + '.lig']});
          codes.push (r.laters);
        });
        ScriptFeats.forEach (feat => {
          otw.addGSUBAlternateLookup ([{
            map: replaces[feat],
          }], {ref: lookupRefs[feat]});
        });
        ['KMOD'].forEach (f => {
          otw.addGSUBAlternateLookup ([{
            map: replaces[f],
          }], {ref: lookupRefs[f]});
        });

        ['SMAL'].forEach (f => {
          let r = otw.addGSUBMultipleLookup ([{
            map: expands[f],
          }], {ref: lookupRefs[f]});
          codes.push (r.laters);
        });
        ['LARG', 'SMSM'].forEach (f => {
          let r = otw.addGSUBSingleLookup ([{
            map: replaces[f],
          }], {ref: lookupRefs[f]});
          codes.push (r.laters);
        });
        {
          let r = otw.addGSUBLigatureLookup ([{
            map: SQAR,
          }], {ref: lookupRefs['SQAR'], extension: true, markFilteringSet: 0});
          codes.push (r.laters);
        }
        ['hwid', 'fwid', 'pwid', 'rtla',
         'SMLB', 'SMCB', 'SMRB', 'SMLM', 'SMCM', 'SMRM',
         'SMLT', 'SMCT', 'SMRT',
         'SMPB', 'SMPM', 'SMPT', 'SMLP', 'SMCP', 'SMRP',
         'SMLQ', 'SMLO',
         'ccmps.dummy',
        ].forEach (f => {
          let r = otw.addGSUBSingleLookup ([{
            map: replaces[f],
          }], {ref: lookupRefs[f]});
          codes.push (r.laters);
        });
        {
          let r = otw.addChainedSequenceContextLookup ([{
            backtrackCoverageRefSets: [],
            inputCoverageRefSets: [covRefSets.hasSMAL, covRefSets.SMAL],
            lookaheadCoverageRefSets: [],
            seqLookups: [
              {sequenceIndex: 0, ref: lookupRefs["SMAL"]},
              {sequenceIndex: 2, ref: lookupRefs["ccmps.dummy"]},
            ],
          }], {ref: lookupRefs['ccmps.SMAL'],
               GSUB: true, markFilteringSet: 1});
          codes.push (r.laters);
          codes.push (() => {
            otw.addCoverage ([{[ gidMap[opts.defs.named_glyphs.SMAL] ]: true}], covRefSets.SMAL);
            otw.addCoverage ([expands.SMAL], covRefSets.hasSMAL);
          });
        }
        {
          let r = otw.addChainedSequenceContextLookup ([{
            backtrackCoverageRefSets: [],
            inputCoverageRefSets: [covRefSets.hasHwid, covRefSets.hwid],
            lookaheadCoverageRefSets: [],
            seqLookups: [
              {sequenceIndex: 0, ref: lookupRefs["hwid"]},
              {sequenceIndex: 1, ref: lookupRefs["ccmps.dummy"]},
            ],
          }], {ref: lookupRefs['ccmps.hwid'],
               GSUB: true, markFilteringSet: 2});
          codes.push (r.laters);
          codes.push (() => {
            otw.addCoverage ([{[ gidMap[opts.defs.named_glyphs.hwid] ]: true}], covRefSets.hwid);
            otw.addCoverage ([replaces.hwid], covRefSets.hasHwid);
          });
        }
        
        {
          let r = otw.addGSUBLigatureLookup ([{
            map: ccmps.fin,
          }], {ref: lookupRefs['ccmps.fin'], markFilteringSet: 0});
          codes.push (r.laters);
        }
        [
          'vert', 'vrt2', 'WDLT', 'WDRT',
          'WHIT', 'SANB',
          'hkna', 'vkna', 'ruby',
        ].forEach (f => {
          let r = otw.addGSUBSingleLookup ([{
            map: replaces[f],
          }], {ref: lookupRefs[f]});
          codes.push (r.laters);
        });
        opts.defs.variant_tags.map (tag => {
          let r = otw.addGSUBSingleLookup ([{
            map: variants[tag],
          }], {ref: lookupRefs[tag], extension: true});
          codes.push (r.laters);
        });
        {
          let r = otw.addGSUBAlternateLookup ([{
            map: salt,
          }], {ref: lookupRefs['salt'], extension: true});
          codes.push (r.laters);
        }

        {
          let r = otw.addGSUBMultipleLookup ([{
            map: df.splitted,
          }], {ref: lookupRefs['ccmps.splitted'], extension: true});
          codes.push (r.laters);
        }
        
        codes.flat ().forEach (_ => _ ());

        font.tables.gsub = {
          arrayBufferList: otw.getArrayBufferList (),
        };
      } // GSUB

      {
        let base = [];
        let layers = [];
        let items = [];
        Object.keys (df.isRed).forEach (_ => {
          let gid1 = _;
          items.push ([gid1]);
        });
        Object.keys (df.withRed).forEach (_ => {
          let gid1 = _;
          let gid2 = df.withRed[gid1];
          items.push ([gid1, gid2]);
        });
        items.sort ((a, b) => a[0]-b[0]).forEach (x => {
          if (x.length === 1) {
            let gid1 = x[0];
            base.push ({glyphID: gid1, firstLayerIndex: layers.length,
                        numLayers: 1});
            layers.push ({glyphID: gid1, paletteIndex: 1});
          } else {
            let gid1 = x[0];
            let gid2 = x[1];
            base.push ({glyphID: gid1, firstLayerIndex: layers.length,
                        numLayers: 2});
            layers.push ({glyphID: gid1, paletteIndex: 0});
            layers.push ({glyphID: gid2, paletteIndex: 1});
          }
        });
        font.tables.colr = {baseGlyphRecords: base, layerRecords: layers};
        font.tables.cpal = {
          colorRecords: [0x000000FF, 0x3333CCFF], // BGRA
        };
      }

      {
        let otw = new OTWriter;
        let codes = [];

        let lookupRefs = [];
        [
          // defs1
          'SMLB.inner', /*'SMCB.inner',*/ 'SMRB.inner', 'SMLM.inner', 'SMCM.inner', 'SMRM.inner', 'SMLT.inner', 'SMCT.inner', 'SMRT.inner',
          'SMLB_l.inner', 'SMRB_r.inner', 'SMLM_l.inner', 'SMRM_r.inner', 'SMLT_l.inner', 'SMRT_r.inner',
          'SMLB_b.inner', /*'SMCB_b.inner',*/ 'SMRB_b.inner', 'SMLT_t.inner', 'SMCT_t.inner', 'SMRT_t.inner',
          
          // defs2
          'SMPB.inner', 'SMPM.inner', 'SMPT.inner', 'SMLP.inner', 'SMCP.inner', 'SMRP.inner',
          'SMLP_l.inner', 'SMRP_r.inner',
          'SMPB_b.inner', 'SMPT_t.inner',
          
          'ccmps.SM*',
          'mark', 'mkmk',
          'mark.18', 'mark.19', 'mark.20', 'mark.21', 'mark.chained',
          'vert.22', 'vert.23', 'ccmp.24', 'vert.26', 'vert', 'ccmp.chained',
          'MODL.inner', 'MODL',
          'CMRK', 'SUPA', 'AWID',
          'ccmps.splitted',
        ].forEach (key => {
          let ref = {
            labels: ['GPOS', key],
            index: [], table: [],
          };
          lookupRefs.push (ref);
          lookupRefs[key] = ref;
        });

        let features = {};
        ['AWID', 'CMRK', 'MODL', 'SUPA', 'mkmk', 'vert'].forEach (tag => {
          features[tag] = [lookupRefs[tag]];
        });
        features.cmap = [lookupRefs['ccmp.chained'],
                         lookupRefs['ccmps.SM*'],
                         lookupRefs['ccmps.splitted']];
        features.mark = [lookupRefs['mark'], lookupRefs['mark.chained']];
        features.vrt2 = [lookupRefs['vert']];
        
        otw.addGPOS (features, lookupRefs, {});
        
        let covRefSets = {
          normal: [],
          mark_rt: [], mark_rb: [], mark_cb: [], mark_lb: [], mark_lm: [], mark_lt: [], mark_ct: [],
          basespace: [], halfwidth: [],
          with_rt: [], modr: [], modl: [], modtw: [], tsu: [],
          base: [], others: [], opaque: [], opaqueOrSpace: [],
          small_normal: [], small_quarter: [],
          small_operators: [],
        };
        covRefSets.base.count = Object.keys (classes.normal).length + Object.keys (classes.basespace).length;
        covRefSets.mark_rt.count = Object.keys (classes.mark_rt).length;
        covRefSets.mark_rb.count = Object.keys (classes.mark_rb).length;
        covRefSets.mark_cb.count = Object.keys (classes.mark_cb).length;
        covRefSets.mark_lb.count = Object.keys (classes.mark_lb).length;
        covRefSets.mark_lm.count = Object.keys (classes.mark_lm).length;
        covRefSets.mark_lt.count = Object.keys (classes.mark_lt).length;
        covRefSets.mark_ct.count = Object.keys (classes.mark_ct).length;
        covRefSets.with_rt.count = Object.keys (classes.with_rt).length;
        covRefSets.halfwidth.count = Object.keys (classes.halfwidth).length;
        covRefSets.others.count = Object.keys (classes.others).length;
        covRefSets.opaqueOrSpace.count = Object.keys (classes.with_rt).length + Object.keys (classes.others).length + Object.keys (classes.halfwidth).length + Object.keys (classes.basespace).length;
        covRefSets.small_operators.count = Object.keys (classes.small_operators).length;
        let anchorRefSets = {
          zero: [], half: [], halfNegative: [], left1: [],
          bottom1: [], bottom2: [], top2: [],
        };
        let baseArrayRefSets = {zero: [], _max: 0};
        [covRefSets.opaqueOrSpace.count, covRefSets.base.count].forEach (size => {
           if (baseArrayRefSets._max < size) baseArrayRefSets._max = size;
         });

        {
          let defs1 = [
            [-0.125, -0    , -0.25 , -0    , -1,'_b', -1,'_l', ['SMLB']],
            //[-0    , -0    , -0    , -0    , -1,'_b', +0,null, ['SMCB']],
            [+0.125, -0    , +0.25 , -0    , -1,'_b', +1,'_r', ['SMRB']],
            [-0.125, +0.125, -0.25 , +0.25 , +0,null, -1,'_l', ['SMLM']],
            [-0    , +0.125, -0    , +0.25 , +0,null, +0,null, ['SMCM']],
            [+0.125, +0.125, +0.25 , +0.25 , +0,null, +1,'_r', ['SMRM']],
            [-0.125, +0.25 , -0.25 , +0.5  , +1,'_t', -1,'_l', ['SMLT']],
            [-0    , +0.25 , -0    , +0.5  , +1,'_t', +0,null, ['SMCT']],
            [+0.125, +0.25 , +0.25 , +0.5  , +1,'_t', +1,'_r', ['SMRT']],
          ];
          let defs2 = [
            [-0.25,0, -0.125,-0   , -0.5,0, -0.25,+0  , -1,'_b', +0,null, ['SMPB']],
            [-0.25,0, -0.125,0.125, -0.5,0, -0.25,0.25, +0,null, +0,null, ['SMPM']],
            [-0.25,0, -0.125,+0.25, -0.5,0, -0.25,+0.5, +1,'_t', +0,null, ['SMPT']],
            [0,-0.25, -0.125,+0.25, 0,-0.5, -0.25,+0.5, +0,null, -1,'_l', ['SMLP']],
            [0,-0.25, -0    ,+0.25, 0,-0.5, +0   ,+0.5, +0,null, +0,null, ['SMCP']],
            [0,-0.25, +0.125,+0.25, 0,-0.5, +0.25,+0.5, +0,null, +1,'_r', ['SMRP']],
          ];

          defs1.forEach (_ => {
            {
              covRefSets[_[8]] = [];
              otw.addGPOSSingleLookup ([{
                coverageRefSet: covRefSets.small_normal,
                xPlacement: _[0] * df.upem, yPlacement: _[1] * df.upem,
              }, {
                coverageRefSet: covRefSets.small_quarter,
                xPlacement: _[2] * df.upem, yPlacement: _[3] * df.upem,
              }], {ref: lookupRefs[_[8] + '.inner']});
            }
            if (_[5]) {
              covRefSets[_[8] + _[5]] = [];
              otw.addGPOSSingleLookup ([{
                coverageRefSet: covRefSets.small_normal,
                xPlacement: _[0] * df.upem,
                yPlacement: (_[1] + _[4] * 0.25) * df.upem,
              }], {ref: lookupRefs[_[8] + _[5] + '.inner']});
            }
            if (_[7]) {
              covRefSets[_[8] + _[7]] = [];
              otw.addGPOSSingleLookup ([{
                coverageRefSet: covRefSets.small_normal,
                xPlacement: (_[0] + _[6] * 0.25) * df.upem,
                yPlacement: _[1] * df.upem,
              }], {ref: lookupRefs[_[8] + _[7] + '.inner']});
            }
          });
          defs2.forEach (_ => {
            {
              covRefSets[_[12]] = [];
              otw.addGPOSSingleLookup ([{
                coverageRefSet: covRefSets.small_normal,
                xPlacement: _[2] * df.upem, yPlacement: _[3] * df.upem,
                xAdvance: _[0] * df.upem, yAdvance: _[1] * df.upem,
              }, {
                coverageRefSet: covRefSets.small_quarter,
                xPlacement: _[6] * df.upem, yPlacement: _[7] * df.upem,
                xAdvance: _[4] * df.upem, yAdvance: _[5] * df.upem,
              }], {ref: lookupRefs[_[12] + '.inner']});
            }
            if (_[9]) {
              covRefSets[_[12] + _[9]] = [];
              otw.addGPOSSingleLookup ([{
                coverageRefSet: covRefSets.small_normal,
                xPlacement: _[2] * df.upem,
                yPlacement: (_[3] + _[8] * 0.25) * df.upem,
                xAdvance: _[0] * df.upem, yAdvance: _[1] * df.upem,
              }], {ref: lookupRefs[_[12] + _[9] + '.inner']});
            }
            if (_[11]) {
              covRefSets[_[12] + _[11]] = [];
              otw.addGPOSSingleLookup ([{
                coverageRefSet: covRefSets.small_normal,
                xPlacement: (_[2] + _[10] * 0.25) * df.upem,
                yPlacement: _[3] * df.upem,
                xAdvance: _[0] * df.upem, yAdvance: _[1] * df.upem,
              }], {ref: lookupRefs[_[12] + _[11] + '.inner']});
            }
          });

          otw.addChainedSequenceContextLookup ([
            defs1.map (_ => {
              return [{
                backtrackCoverageRefSets: [],
                inputCoverageRefSets: [covRefSets.small_normal],
                lookaheadCoverageRefSets: [covRefSets[_[8]]],
                seqLookups: [{sequenceIndex: 0,
                              ref: lookupRefs[_[8] + '.inner']}],
              }, {
                backtrackCoverageRefSets: [],
                inputCoverageRefSets: [covRefSets.small_quarter],
                lookaheadCoverageRefSets: [covRefSets[_[8]]],
                seqLookups: [{sequenceIndex: 0,
                              ref: lookupRefs[_[8] + '.inner']}],
              }];
            }),
            defs2.map (_ => {
              return [{
                backtrackCoverageRefSets: [],
                inputCoverageRefSets: [covRefSets.small_normal],
                lookaheadCoverageRefSets: [covRefSets[_[12]]],
                seqLookups: [{sequenceIndex: 0,
                              ref: lookupRefs[_[12] + '.inner']}],
              }, {
                backtrackCoverageRefSets: [],
                inputCoverageRefSets: [covRefSets.small_quarter],
                lookaheadCoverageRefSets: [covRefSets[_[12]]],
                seqLookups: [{sequenceIndex: 0,
                              ref: lookupRefs[_[12] + '.inner']}],
              }];
            }),
            
            defs1.filter (_ => _[5]).map (_ => {
              return [{
                backtrackCoverageRefSets: [],
                inputCoverageRefSets: [covRefSets.small_normal],
                lookaheadCoverageRefSets: [covRefSets[_[8] + _[5]]],
                seqLookups: [{sequenceIndex: 0,
                              ref: lookupRefs[_[8] + _[5] + '.inner']}],
              }, {
                backtrackCoverageRefSets: [],
                inputCoverageRefSets: [covRefSets.small_quarter],
                lookaheadCoverageRefSets: [covRefSets[_[8] + _[5]]],
                seqLookups: [{sequenceIndex: 0,
                              ref: lookupRefs[_[8] + '.inner']}],
              }];
            }),
            defs1.filter (_ => _[7]).map (_ => {
              return [{
                backtrackCoverageRefSets: [],
                inputCoverageRefSets: [covRefSets.small_normal],
                lookaheadCoverageRefSets: [covRefSets[_[8] + _[7]]],
                seqLookups: [{sequenceIndex: 0,
                              ref: lookupRefs[_[8] + _[7] + '.inner']}],
              }, {
                backtrackCoverageRefSets: [],
                inputCoverageRefSets: [covRefSets.small_quarter],
                lookaheadCoverageRefSets: [covRefSets[_[8] + _[7]]],
                seqLookups: [{sequenceIndex: 0,
                              ref: lookupRefs[_[8] + '.inner']}],
              }];
            }),
            defs2.filter (_ => _[9]).map (_ => {
              return [{
                backtrackCoverageRefSets: [],
                inputCoverageRefSets: [covRefSets.small_normal],
                lookaheadCoverageRefSets: [covRefSets[_[12] + _[9]]],
                seqLookups: [{sequenceIndex: 0,
                              ref: lookupRefs[_[12] + _[9] + '.inner']}],
              }, {
                backtrackCoverageRefSets: [],
                inputCoverageRefSets: [covRefSets.small_quarter],
                lookaheadCoverageRefSets: [covRefSets[_[12] + _[9]]],
                seqLookups: [{sequenceIndex: 0,
                              ref: lookupRefs[_[12] + '.inner']}],
              }];
            }),
            defs2.filter (_ => _[11]).map (_ => {
              return [{
                backtrackCoverageRefSets: [],
                inputCoverageRefSets: [covRefSets.small_normal],
                lookaheadCoverageRefSets: [covRefSets[_[12] + _[11]]],
                seqLookups: [{sequenceIndex: 0,
                              ref: lookupRefs[_[12] + _[11] + '.inner']}],
              }, {
                backtrackCoverageRefSets: [],
                inputCoverageRefSets: [covRefSets.small_quarter],
                lookaheadCoverageRefSets: [covRefSets[_[12] + _[11]]],
                seqLookups: [{sequenceIndex: 0,
                              ref: lookupRefs[_[12] + '.inner']}],
              }];
            }),
          ].flat ().flat (), {ref: lookupRefs['ccmps.SM*']});
        }
        ['SMLB', //'SMCB',
         'SMRB', 'SMLM', 'SMCM', 'SMRM',
         'SMLT', 'SMCT', 'SMRT',
         'SMPB', 'SMPM', 'SMPT', 'SMLP', 'SMCP', 'SMRP'].forEach (_ => {
           otw.addCoverage
               ([{[ gidMap[opts.defs.named_glyphs[_]] ]: true}], covRefSets[_]);
           if (gidMap[opts.defs.named_glyphs[_ + '_t']])
           otw.addCoverage
               ([{[ gidMap[opts.defs.named_glyphs[_ + '_t']] ]: true}],
                covRefSets[_ + '_t']);
           if (gidMap[opts.defs.named_glyphs[_ + '_b']])
           otw.addCoverage
               ([{[ gidMap[opts.defs.named_glyphs[_ + '_b']] ]: true}],
                covRefSets[_ + '_b']);
           if (gidMap[opts.defs.named_glyphs[_ + '_l']])
           otw.addCoverage
               ([{[ gidMap[opts.defs.named_glyphs[_ + '_l']] ]: true}],
                covRefSets[_ + '_l']);
           if (gidMap[opts.defs.named_glyphs[_ + '_r']])
           otw.addCoverage
               ([{[ gidMap[opts.defs.named_glyphs[_ + '_r']] ]: true}],
                covRefSets[_ + '_r']);
        });
        
        {
          let r = otw.addGPOSMarkLookup ('base', [{ // 15 (mark)
            markCoverageRefSet: covRefSets.mark_rt,
            baseCoverageRefSet: covRefSets.base,
            markCoverageCount: covRefSets.mark_rt.count,
            baseCoverageCount: covRefSets.base.count,
            markAnchorRefSet: anchorRefSets.zero,
            baseArrayRefSet: baseArrayRefSets.zero,
          }, {
            markCoverageRefSet: covRefSets.mark_rb,
            baseCoverageRefSet: covRefSets.base,
            markCoverageCount: covRefSets.mark_rb.count,
            baseCoverageCount: covRefSets.base.count,
            markAnchorRefSet: anchorRefSets.zero,
            baseArrayRefSet: baseArrayRefSets.zero,
          }, {
            markCoverageRefSet: covRefSets.mark_rb,
            baseCoverageRefSet: covRefSets.with_rt,
            markCoverageCount: covRefSets.mark_rb.count,
            baseCoverageCount: covRefSets.with_rt.count,
            markAnchorRefSet: anchorRefSets.zero,
            baseArrayRefSet: baseArrayRefSets.zero,
          }, {
            markCoverageRefSet: covRefSets.mark_cb,
            baseCoverageRefSet: covRefSets.base,
            markCoverageCount: covRefSets.mark_cb.count,
            baseCoverageCount: covRefSets.base.count,
            markAnchorRefSet: anchorRefSets.bottom1,
            baseArrayRefSet: baseArrayRefSets.zero,
          }, {
            markCoverageRefSet: covRefSets.mark_cb,
            baseCoverageRefSet: covRefSets.opaque,
            markCoverageCount: covRefSets.mark_cb.count,
            baseCoverageCount: covRefSets.opaque.count,
            markAnchorRefSet: anchorRefSets.bottom1,
            baseArrayRefSet: baseArrayRefSets.zero,
          }, {
            markCoverageRefSet: covRefSets.mark_lb,
            baseCoverageRefSet: covRefSets.base,
            markCoverageCount: covRefSets.mark_lb.count,
            baseCoverageCount: covRefSets.base.count,
            markAnchorRefSet: anchorRefSets.zero,
            baseArrayRefSet: baseArrayRefSets.zero,
          }, {
            markCoverageRefSet: covRefSets.mark_lb,
            baseCoverageRefSet: covRefSets.with_rt,
            markCoverageCount: covRefSets.mark_lb.count,
            baseCoverageCount: covRefSets.with_rt.count,
            markAnchorRefSet: anchorRefSets.zero,
            baseArrayRefSet: baseArrayRefSets.zero,
          }, {
            markCoverageRefSet: covRefSets.mark_lm,
            baseCoverageRefSet: covRefSets.base,
            markCoverageCount: covRefSets.mark_lm.count,
            baseCoverageCount: covRefSets.base.count,
            markAnchorRefSet: anchorRefSets.left1,
            baseArrayRefSet: baseArrayRefSets.zero,
          }, {
            markCoverageRefSet: covRefSets.mark_lm,
            baseCoverageRefSet: covRefSets.opaque,
            markCoverageCount: covRefSets.mark_lm.count,
            baseCoverageCount: covRefSets.opaque.count,
            markAnchorRefSet: anchorRefSets.left1,
            baseArrayRefSet: baseArrayRefSets.zero,
          }, {
            markCoverageRefSet: covRefSets.mark_lt,
            baseCoverageRefSet: covRefSets.base,
            markCoverageCount: covRefSets.mark_lt.count,
            baseCoverageCount: covRefSets.base.count,
            markAnchorRefSet: anchorRefSets.zero,
            baseArrayRefSet: baseArrayRefSets.zero,
          }, {
            markCoverageRefSet: covRefSets.mark_lt,
            baseCoverageRefSet: covRefSets.with_rt,
            markCoverageCount: covRefSets.mark_lt.count,
            baseCoverageCount: covRefSets.with_rt.count,
            markAnchorRefSet: anchorRefSets.zero,
            baseArrayRefSet: baseArrayRefSets.zero,
          }, {
            markCoverageRefSet: covRefSets.mark_ct,
            baseCoverageRefSet: covRefSets.base,
            markCoverageCount: covRefSets.mark_ct.count,
            baseCoverageCount: covRefSets.base.count,
            markAnchorRefSet: anchorRefSets.zero,
            baseArrayRefSet: baseArrayRefSets.zero,
          }, {
            markCoverageRefSet: covRefSets.mark_ct,
            baseCoverageRefSet: covRefSets.with_rt,
            markCoverageCount: covRefSets.mark_ct.count,
            baseCoverageCount: covRefSets.with_rt.count,
            markAnchorRefSet: anchorRefSets.zero,
            baseArrayRefSet: baseArrayRefSets.zero,
          }, {
            markCoverageRefSet: covRefSets.mark_ct,
            baseCoverageRefSet: covRefSets.others,
            markCoverageCount: covRefSets.mark_ct.count,
            baseCoverageCount: covRefSets.others.count,
            markAnchorRefSet: anchorRefSets.top2,
            baseArrayRefSet: baseArrayRefSets.zero,
          }, {
            markCoverageRefSet: covRefSets.mark_rt,
            baseCoverageRefSet: covRefSets.with_rt,
            markCoverageCount: covRefSets.mark_rt.count,
            baseCoverageCount: covRefSets.with_rt.count,
            markAnchorRefSet: anchorRefSets.half,
            baseArrayRefSet: baseArrayRefSets.zero,
          }, {
            markCoverageRefSet: covRefSets.mark_rt,
            baseCoverageRefSet: covRefSets.others,
            markCoverageCount: covRefSets.mark_rt.count,
            baseCoverageCount: covRefSets.others.count,
            markAnchorRefSet: anchorRefSets.half,
            baseArrayRefSet: baseArrayRefSets.zero,
          }, {
            markCoverageRefSet: covRefSets.mark_rb,
            baseCoverageRefSet: covRefSets.others,
            markCoverageCount: covRefSets.mark_rb.count,
            baseCoverageCount: covRefSets.others.count,
            markAnchorRefSet: anchorRefSets.half,
            baseArrayRefSet: baseArrayRefSets.zero,
          }, {
            markCoverageRefSet: covRefSets.mark_lb,
            baseCoverageRefSet: covRefSets.others,
            markCoverageCount: covRefSets.mark_lb.count,
            baseCoverageCount: covRefSets.others.count,
            markAnchorRefSet: anchorRefSets.left1,
            baseArrayRefSet: baseArrayRefSets.zero,
          }, {
            markCoverageRefSet: covRefSets.mark_lm,
            baseCoverageRefSet: covRefSets.others,
            markCoverageCount: covRefSets.mark_lm.count,
            baseCoverageCount: covRefSets.others.count,
            markAnchorRefSet: anchorRefSets.left1,
            baseArrayRefSet: baseArrayRefSets.zero,
          }, {
            markCoverageRefSet: covRefSets.mark_lt,
            baseCoverageRefSet: covRefSets.others,
            markCoverageCount: covRefSets.mark_lt.count,
            baseCoverageCount: covRefSets.others.count,
            markAnchorRefSet: anchorRefSets.left1,
            baseArrayRefSet: baseArrayRefSets.zero,
          }, { 
            markCoverageRefSet: covRefSets.mark_rt,
            baseCoverageRefSet: covRefSets.halfwidth,
            markCoverageCount: covRefSets.mark_rt.count,
            baseCoverageCount: covRefSets.halfwidth.count,
            markAnchorRefSet: anchorRefSets.zero,
            baseAnchorRefSet: anchorRefSets.zero,
          }, { 
            markCoverageRefSet: covRefSets.mark_rb,
            baseCoverageRefSet: covRefSets.halfwidth,
            markCoverageCount: covRefSets.mark_rb.count,
            baseCoverageCount: covRefSets.halfwidth.count,
            markAnchorRefSet: anchorRefSets.zero,
            baseAnchorRefSet: anchorRefSets.zero,
          }, { 
            markCoverageRefSet: covRefSets.mark_lb,
            baseCoverageRefSet: covRefSets.halfwidth,
            markCoverageCount: covRefSets.mark_lb.count,
            baseCoverageCount: covRefSets.halfwidth.count,
            markAnchorRefSet: anchorRefSets.left1,
            baseAnchorRefSet: anchorRefSets.zero,
          }, { 
            markCoverageRefSet: covRefSets.mark_lm,
            baseCoverageRefSet: covRefSets.halfwidth,
            markCoverageCount: covRefSets.mark_lm.count,
            baseCoverageCount: covRefSets.halfwidth.count,
            markAnchorRefSet: anchorRefSets.left1,
            baseAnchorRefSet: anchorRefSets.zero,
          }, { 
            markCoverageRefSet: covRefSets.mark_lt,
            baseCoverageRefSet: covRefSets.halfwidth,
            markCoverageCount: covRefSets.mark_lt.count,
            baseCoverageCount: covRefSets.halfwidth.count,
            markAnchorRefSet: anchorRefSets.left1,
            baseAnchorRefSet: anchorRefSets.zero,
          }], {ref: lookupRefs['mark']});
          codes.push (r.laters);
        } // mark
        
        otw.addGPOSMarkLookup ('mark', [{ // 16 (mkmk)
          markCoverageRefSet: covRefSets.mark_rt,
          baseCoverageRefSet: covRefSets.mark_rt,
          markCoverageCount: covRefSets.mark_rt.count,
          baseCoverageCount: covRefSets.mark_rt.count,
          markAnchorRefSet: anchorRefSets.half,
          baseArrayRefSet: baseArrayRefSets.zero,
        }, {
          markCoverageRefSet: covRefSets.mark_rb,
          baseCoverageRefSet: covRefSets.mark_rb,
          markCoverageCount: covRefSets.mark_rb.count,
          baseCoverageCount: covRefSets.mark_rb.count,
          markAnchorRefSet: anchorRefSets.half,
          baseArrayRefSet: baseArrayRefSets.zero,
        }, {
          markCoverageRefSet: covRefSets.mark_cb,
          baseCoverageRefSet: covRefSets.mark_cb,
          markCoverageCount: covRefSets.mark_cb.count,
          baseCoverageCount: covRefSets.mark_cb.count,
          markAnchorRefSet: anchorRefSets.bottom2,
          baseArrayRefSet: baseArrayRefSets.zero,
        }, {
          markCoverageRefSet: covRefSets.mark_lb,
          baseCoverageRefSet: covRefSets.mark_lb,
          markCoverageCount: covRefSets.mark_lb.count,
          baseCoverageCount: covRefSets.mark_lb.count,
          markAnchorRefSet: anchorRefSets.halfNegative,
          baseArrayRefSet: baseArrayRefSets.zero,
        }, {
          markCoverageRefSet: covRefSets.mark_lm,
          baseCoverageRefSet: covRefSets.mark_lm,
          markCoverageCount: covRefSets.mark_lm.count,
          baseCoverageCount: covRefSets.mark_lm.count,
          markAnchorRefSet: anchorRefSets.halfNegative,
          baseArrayRefSet: baseArrayRefSets.zero,
        }, {
          markCoverageRefSet: covRefSets.mark_lt,
          baseCoverageRefSet: covRefSets.mark_lt,
          markCoverageCount: covRefSets.mark_lt.count,
          baseCoverageCount: covRefSets.mark_lt.count,
          markAnchorRefSet: anchorRefSets.halfNegative,
          baseArrayRefSet: baseArrayRefSets.zero,
        }, {
          markCoverageRefSet: covRefSets.mark_ct,
          baseCoverageRefSet: covRefSets.mark_ct,
          markCoverageCount: covRefSets.mark_ct.count,
          baseCoverageCount: covRefSets.mark_ct.count,
          markAnchorRefSet: anchorRefSets.top2,
          baseArrayRefSet: baseArrayRefSets.zero,
        }], {ref: lookupRefs['mkmk']});

        otw.addGPOSSingleLookup ([{ // 18
          coverageRefSet: covRefSets.opaqueOrSpace,
          xAdvance: +0.5 * df.upem,
        }], {ref: lookupRefs['mark.18']});
        otw.addGPOSSingleLookup ([{ // 19
          coverageRefSet: covRefSets.normal,
          yAdvance: +0.25 * df.upem,
        }, {
          coverageRefSet: covRefSets.opaqueOrSpace,
          yAdvance: +0.25 * df.upem,
        }], {ref: lookupRefs['mark.19']});
        otw.addGPOSSingleLookup ([{ // 20
          coverageRefSet: covRefSets.normal,
          yAdvance: +0.5 * df.upem,
        }, {
          coverageRefSet: covRefSets.opaqueOrSpace,
          yAdvance: +0.5 * df.upem,
        }], {ref: lookupRefs['mark.20']});
        otw.addGPOSSingleLookup ([{ // 21
          coverageRefSet: covRefSets.normal,
          xPlacement: +0.25 * df.upem,
          xAdvance: +0.25 * df.upem,
        }, {
          coverageRefSet: covRefSets.opaqueOrSpace,
          xPlacement: +0.25 * df.upem,
          xAdvance: +0.25 * df.upem,
        }], {ref: lookupRefs['mark.21']});
        otw.addChainedSequenceContextLookup ([{ // 17 (mark)
          backtrackCoverageRefSets: [],
          inputCoverageRefSets: [covRefSets.opaque, covRefSets.mark_rt],
          lookaheadCoverageRefSets: [],
          seqLookups: [{sequenceIndex: 0, ref: lookupRefs["mark.18"]}],
        }, {
          backtrackCoverageRefSets: [],
          inputCoverageRefSets: [covRefSets.basespace, covRefSets.mark_rt, covRefSets.mark_rt],
          lookaheadCoverageRefSets: [],
          seqLookups: [{sequenceIndex: 0, ref: lookupRefs["mark.18"]}],
        }, {
          backtrackCoverageRefSets: [],
          inputCoverageRefSets: [covRefSets.others, covRefSets.mark_rb],
          lookaheadCoverageRefSets: [],
          seqLookups: [{sequenceIndex: 0, ref: lookupRefs["mark.18"]}],
        }, {
          backtrackCoverageRefSets: [],
          inputCoverageRefSets: [covRefSets.halfwidth, covRefSets.mark_rb],
          lookaheadCoverageRefSets: [],
          seqLookups: [{sequenceIndex: 0, ref: lookupRefs["mark.18"]}],
        }, {
          backtrackCoverageRefSets: [],
          inputCoverageRefSets: [covRefSets.basespace, covRefSets.mark_rb, covRefSets.mark_rb],
          lookaheadCoverageRefSets: [],
          seqLookups: [{sequenceIndex: 0, ref: lookupRefs["mark.18"]}],
        }, {
          backtrackCoverageRefSets: [],
          inputCoverageRefSets: [covRefSets.base, covRefSets.mark_cb, covRefSets.mark_cb],
          lookaheadCoverageRefSets: [],
          seqLookups: [{sequenceIndex: 0, ref: lookupRefs["mark.20"]}],
        }, {
          backtrackCoverageRefSets: [],
          inputCoverageRefSets: [covRefSets.opaque, covRefSets.mark_cb, covRefSets.mark_cb],
          lookaheadCoverageRefSets: [],
          seqLookups: [{sequenceIndex: 0, ref: lookupRefs["mark.20"]}],
        }, {
          backtrackCoverageRefSets: [],
          inputCoverageRefSets: [covRefSets.base, covRefSets.mark_cb],
          lookaheadCoverageRefSets: [],
          seqLookups: [{sequenceIndex: 0, ref: lookupRefs["mark.19"]}],
        }, {
          backtrackCoverageRefSets: [],
          inputCoverageRefSets: [covRefSets.opaque, covRefSets.mark_cb],
          lookaheadCoverageRefSets: [],
          seqLookups: [{sequenceIndex: 0, ref: lookupRefs["mark.19"]}],
        }, {
          backtrackCoverageRefSets: [],
          inputCoverageRefSets: [covRefSets.base, covRefSets.mark_lm],
          lookaheadCoverageRefSets: [],
          seqLookups: [{sequenceIndex: 0, ref: lookupRefs["mark.21"]}],
        }, {
          backtrackCoverageRefSets: [],
          inputCoverageRefSets: [covRefSets.opaque, covRefSets.mark_lm],
          lookaheadCoverageRefSets: [],
          seqLookups: [{sequenceIndex: 0, ref: lookupRefs["mark.21"]}],
        }, {
          backtrackCoverageRefSets: [],
          inputCoverageRefSets: [covRefSets.others, covRefSets.mark_lb],
          lookaheadCoverageRefSets: [],
          seqLookups: [{sequenceIndex: 0, ref: lookupRefs["mark.21"]}],
        }, {
          backtrackCoverageRefSets: [],
          inputCoverageRefSets: [covRefSets.halfwidth, covRefSets.mark_lb],
          lookaheadCoverageRefSets: [],
          seqLookups: [{sequenceIndex: 0, ref: lookupRefs["mark.21"]}],
        }, {
          backtrackCoverageRefSets: [],
          inputCoverageRefSets: [covRefSets.basespace, covRefSets.mark_lb, covRefSets.mark_lb],
          lookaheadCoverageRefSets: [],
          seqLookups: [{sequenceIndex: 0, ref: lookupRefs["mark.21"]}],
        }, {
          backtrackCoverageRefSets: [],
          inputCoverageRefSets: [covRefSets.others, covRefSets.mark_lt],
          lookaheadCoverageRefSets: [],
          seqLookups: [{sequenceIndex: 0, ref: lookupRefs["mark.21"]}],
        }, {
          backtrackCoverageRefSets: [],
          inputCoverageRefSets: [covRefSets.halfwidth, covRefSets.mark_lt],
          lookaheadCoverageRefSets: [],
          seqLookups: [{sequenceIndex: 0, ref: lookupRefs["mark.21"]}],
        }, {
          backtrackCoverageRefSets: [],
          inputCoverageRefSets: [covRefSets.basespace, covRefSets.mark_lt, covRefSets.mark_lt],
          lookaheadCoverageRefSets: [],
          seqLookups: [{sequenceIndex: 0, lookupRefs: lookupRefs["mark.21"].index}],
        }], {ref: lookupRefs['mark.chained'], markFilteringSet: 0});

        otw.addGPOSSingleLookup ([{ // 22
          coverageRefSet: covRefSets.normal,
          yPlacement: -0.25 * df.upem,
          yAdvance: +0.25 * df.upem,
        }, {
          coverageRefSet: covRefSets.opaqueOrSpace,
          yPlacement: -0.25 * df.upem,
          yAdvance: +0.25 * df.upem,
        }], {ref: lookupRefs['vert.22']});
        otw.addGPOSSingleLookup ([{ // 23
          coverageRefSet: covRefSets.normal,
          yPlacement: -0.5 * df.upem,
          yAdvance: +0.5 * df.upem,
        }, {
          coverageRefSet: covRefSets.opaqueOrSpace,
          yPlacement: -0.5 * df.upem,
          yAdvance: +0.5 * df.upem,
        }], {ref: lookupRefs['vert.23']});
        otw.addGPOSSingleLookup ([{ // 24
          coverageRefSet: covRefSets.modl,
          xPlacement: -0.125 * df.upem,
          xAdvance: (-0.75 - 0.125 + 0.5) * df.upem,
        }], {ref: lookupRefs['ccmp.24']});

        otw.addGPOSSingleLookup ([{ // 26
          coverageRefSet: covRefSets.modr,
          xPlacement: +1 * df.upem,
          yPlacement: +1 * df.upem,
          yAdvance: -1 * df.upem,
        }], {ref: lookupRefs['vert.26']});
        otw.addChainedSequenceContextLookup ([{ // 25 (vert)
          backtrackCoverageRefSets: [covRefSets.normal],
          inputCoverageRefSets: [covRefSets.modr],
          lookaheadCoverageRefSets: [covRefSets.tsu],
          seqLookups: [{sequenceIndex: 0, ref: lookupRefs["vert.26"]}],
        }, {
          backtrackCoverageRefSets: [],
          inputCoverageRefSets: [covRefSets.base, covRefSets.mark_ct, covRefSets.mark_ct, covRefSets.mark_ct],
          lookaheadCoverageRefSets: [],
          seqLookups: [{sequenceIndex: 0, ref: lookupRefs["vert.23"]}],
        }, {
          backtrackCoverageRefSets: [],
          inputCoverageRefSets: [covRefSets.opaque, covRefSets.mark_ct, covRefSets.mark_ct, covRefSets.mark_ct],
          lookaheadCoverageRefSets: [],
          seqLookups: [{sequenceIndex: 0, ref: lookupRefs["vert.23"]}],
        }, {
          backtrackCoverageRefSets: [],
          inputCoverageRefSets: [covRefSets.base, covRefSets.mark_ct, covRefSets.mark_ct],
          lookaheadCoverageRefSets: [],
          seqLookups: [{sequenceIndex: 0, ref: lookupRefs["vert.22"]}],
        }, {
          backtrackCoverageRefSets: [],
          inputCoverageRefSets: [covRefSets.opaque, covRefSets.mark_ct, covRefSets.mark_ct],
          lookaheadCoverageRefSets: [],
          seqLookups: [{sequenceIndex: 0, ref: lookupRefs["vert.22"]}],
        }], {ref: lookupRefs['vert'], markFilteringSet: 0});

        otw.addChainedSequenceContextLookup ([{ // 27 (ccmp)
          backtrackCoverageRefSets: [],
          inputCoverageRefSets: [covRefSets.modl],
          lookaheadCoverageRefSets: [covRefSets.base],
          seqLookups: [{sequenceIndex: 0, ref: lookupRefs["ccmp.24"]}],
        }, {
          backtrackCoverageRefSets: [],
          inputCoverageRefSets: [covRefSets.modl],
          lookaheadCoverageRefSets: [covRefSets.with_rt],
          seqLookups: [{sequenceIndex: 0, ref: lookupRefs["ccmp.24"]}],
        }], {ref: lookupRefs['ccmp.chained'], markFilteringSet: 0});
        
        otw.addGPOSSingleLookup ([{ // 29
          coverageRefSet: covRefSets.modr,
          xPlacement: -2 * df.upem,
        }], {ref: lookupRefs['MODL.inner']});
        otw.addChainedSequenceContextLookup ([{ // 28 (MODL)
          backtrackCoverageRefSets: [covRefSets.normal],
          inputCoverageRefSets: [covRefSets.modr],
          lookaheadCoverageRefSets: [covRefSets.tsu],
          seqLookups: [{sequenceIndex: 0, ref: lookupRefs["MODL.inner"]}],
        }], {ref: lookupRefs['MODL'], markFilteringSet: 0});
        
        anchorRefSets.rtCenter = [];
        anchorRefSets.rbCenter = [];
        anchorRefSets.cbCenter = [];
        anchorRefSets.lbCenter = [];
        anchorRefSets.lmCenter = [];
        anchorRefSets.ltCenter = [];
        anchorRefSets.ctCenter = [];
        otw.addGPOSMarkLookup ('base', [{ // 30 (CMRK)
          markCoverageRefSet: covRefSets.mark_rt,
          baseCoverageRefSet: covRefSets.basespace,
          markCoverageCount: Object.keys (classes.mark_rt).length,
          baseCoverageCount: Object.keys (classes.basespace).length,
          markAnchorRefSet: anchorRefSets.rtCenter,
          baseArrayRefSet: baseArrayRefSets.zero,
        }, {
          markCoverageRefSet: covRefSets.mark_rb,
          baseCoverageRefSet: covRefSets.basespace,
          markCoverageCount: Object.keys (classes.mark_rb).length,
          baseCoverageCount: Object.keys (classes.basespace).length,
          markAnchorRefSet: anchorRefSets.rbCenter,
          baseArrayRefSet: baseArrayRefSets.zero,
        }, {
          markCoverageRefSet: covRefSets.mark_cb,
          baseCoverageRefSet: covRefSets.basespace,
          markCoverageCount: Object.keys (classes.mark_cb).length,
          baseCoverageCount: Object.keys (classes.basespace).length,
          markAnchorRefSet: anchorRefSets.cbCenter,
          baseArrayRefSet: baseArrayRefSets.zero,
        }, {
          markCoverageRefSet: covRefSets.mark_lb,
          baseCoverageRefSet: covRefSets.basespace,
          markCoverageCount: Object.keys (classes.mark_lb).length,
          baseCoverageCount: Object.keys (classes.basespace).length,
          markAnchorRefSet: anchorRefSets.lbCenter,
          baseArrayRefSet: baseArrayRefSets.zero,
        }, {
          markCoverageRefSet: covRefSets.mark_lm,
          baseCoverageRefSet: covRefSets.basespace,
          markCoverageCount: Object.keys (classes.mark_lm).length,
          baseCoverageCount: Object.keys (classes.basespace).length,
          markAnchorRefSet: anchorRefSets.lmCenter,
          baseArrayRefSet: baseArrayRefSets.zero,
        }, {
          markCoverageRefSet: covRefSets.mark_lt,
          baseCoverageRefSet: covRefSets.basespace,
          markCoverageCount: Object.keys (classes.mark_lt).length,
          baseCoverageCount: Object.keys (classes.basespace).length,
          markAnchorRefSet: anchorRefSets.ltCenter,
          baseArrayRefSet: baseArrayRefSets.zero,
        }, {
          markCoverageRefSet: covRefSets.mark_ct,
          baseCoverageRefSet: covRefSets.basespace,
          markCoverageCount: Object.keys (classes.mark_ct).length,
          baseCoverageCount: Object.keys (classes.basespace).length,
          markAnchorRefSet: anchorRefSets.ctCenter,
          baseArrayRefSet: baseArrayRefSets.zero,
        }], {ref: lookupRefs['CMRK']});
        [
          ['rtCenter', +1, +1],
          //['rmCenter', +1, +0],
          ['rbCenter', +1, -1],
          ['cbCenter', +0, -1],
          ['lbCenter', -1, -1],
          ['lmCenter', -1, +0],
          ['ltCenter', -1, +1],
          ['ctCenter', +0, +1],
        ].forEach (_ => {
          let table = otw.startTable (anchorRefSets[_[0]]);
          otw.add ([['uint16', 1],
                    ['int16', (+0.25 + 0.125) * _[1] * df.upem],
                    ['int16', (+0.25 + 0.125) * _[2] * df.upem]]);
        }); // format, xCoordinate, yCoordinate
        
        otw.addGPOSSingleLookup ([{ 
          coverageRefSet: covRefSets.base,
          yPlacement: +0.5 * df.upem,
        }, { 
          coverageRefSet: covRefSets.opaqueOrSpace,
          yPlacement: +0.5 * df.upem,
        }], {ref: lookupRefs['SUPA']});

        {
          let crs = {};
          let gids = {};
          let items = [];
          Object.keys (opts.defs.AWID || {}).forEach (_ => {
            let w = opts.defs.AWID[_];
            if (!crs[w]) {
              crs[w] = [];
              gids[w] = {};
              items.push ([w]);
            }
            gids[w][gidMap[_]] = true;
          });
          otw.addGPOSSingleLookup (items.map (([w]) => { 
            return {
              coverageRefSet: crs[w],
              xPlacement: - (16 - w) / 2 / 16 * df.upem,
              xAdvance: (-16 + w) / 16 * df.upem,
            };
          }), {ref: lookupRefs['AWID']});
          Object.keys (crs).forEach (w => {
            otw.addCoverage ([gids[w]], crs[w]);
          });
        }

        {
          let gids = Object.values (df.splitted).map (_ => _.slice (0, _.length-1)).flat ();
          let refSets = [];
          otw.addGPOSSingleLookup (gids.map (gid => {
            refSets[gid] = [];
            let glyph = df.glyphs[gid];
            return {
              coverageRefSet: refSets[gid],
              xAdvance: -1 * glyph.advanceWidth,
            };
          }), {ref: lookupRefs['ccmps.splitted']});
          gids.forEach (gid => otw.addCoverage ([{gids: [gid]}], refSets[gid]));
        }
        
        codes.flat ().forEach (_ => _ ());
        
        otw.addCoverage ([classes.basespace], covRefSets.basespace);
        otw.addCoverage ([classes.modr], covRefSets.modr);
        otw.addCoverage ([classes.modl], covRefSets.modl);
        otw.addCoverage ([classes.modtw], covRefSets.modtw);
        otw.addCoverage ([classes.tsu], covRefSets.tsu);
        otw.addCoverage ([classes.mark_rt], covRefSets.mark_rt);
        otw.addCoverage ([classes.mark_rb], covRefSets.mark_rb);
        otw.addCoverage ([classes.mark_cb], covRefSets.mark_cb);
        otw.addCoverage ([classes.mark_lb], covRefSets.mark_lb);
        otw.addCoverage ([classes.mark_lm], covRefSets.mark_lm);
        otw.addCoverage ([classes.mark_lt], covRefSets.mark_lt);
        otw.addCoverage ([classes.mark_ct], covRefSets.mark_ct);
        otw.addCoverage ([classes.halfwidth], covRefSets.halfwidth);
        otw.addCoverage ([classes.with_rt], covRefSets.with_rt);
        otw.addCoverage ([classes.small_operators], covRefSets.small_operators);
        otw.addCoverage ([classes.small_normal], covRefSets.small_normal);
        otw.addCoverage ([classes.small_quarter], covRefSets.small_quarter);
        otw.addCoverage ([classes.normal], covRefSets.normal);
        otw.addCoverage ([classes.others], covRefSets.others);
        otw.addCoverage ([classes.basespace, classes.normal], covRefSets.base);
        otw.addCoverage ([classes.with_rt, classes.others, classes.halfwidth], covRefSets.opaque);
        otw.addCoverage ([classes.with_rt, classes.others, classes.halfwidth, classes.basespace], covRefSets.opaqueOrSpace);

        {
          let baseArray = otw.startTable (baseArrayRefSets.zero);
          let fields = [
            ['uint16', baseArrayRefSets._max], // baseCount, mark2Count
          ];
          for (let i = 0; i < baseArrayRefSets._max; i++) {
            fields.push (baseArray.offset16 (anchorRefSets.zero));
          }
          otw.add (fields);
        }

        {
          let table = otw.startTable (anchorRefSets.zero);
          otw.add ([['uint16', 1], ['int16', 0], ['int16', 0]]);
        } // format, xCoordinate, yCoordinate
        {
          let table = otw.startTable (anchorRefSets.half);
          otw.add ([['uint16', 1], ['int16', -0.5 * df.upem], ['int16', 0]]);
        } // format, xCoordinate, yCoordinate
        {
          let table = otw.startTable (anchorRefSets.halfNegative);
          otw.add ([['uint16', 1], ['int16', +0.5 * df.upem], ['int16', 0]]);
        } // format, xCoordinate, yCoordinate
        {
          let table = otw.startTable (anchorRefSets.left1);
          otw.add ([['uint16', 1], ['int16', +0.125 * df.upem], ['int16', 0]]);
        } // format, xCoordinate, yCoordinate
        {
          let table = otw.startTable (anchorRefSets.bottom1);
          otw.add ([['uint16', 1], ['int16', 0], ['int16', +0.125 * df.upem]]);
        } // format, xCoordinate, yCoordinate
        {
          let table = otw.startTable (anchorRefSets.bottom2);
          otw.add ([['uint16', 1], ['int16', 0], ['int16', +0.25 * df.upem]]);
        } // format, xCoordinate, yCoordinate
        {
          let table = otw.startTable (anchorRefSets.top2);
          otw.add ([['uint16', 1], ['int16', 0], ['int16', -0.25 * df.upem]]);
        } // format, xCoordinate, yCoordinate

        font.tables.gpos = {
          arrayBufferList: otw.getArrayBufferList (),
        };
      }

      for (let i = 0; i < font.glyphs.length; i++) {
	let glyph = font.glyphs.get (i);
        glyph.name ??= 'gid' + i;
      }
      console.log ("Writing |"+opts.otfPath+"|...");
      await fs.writeFile (opts.otfPath, new DataView (font.toArrayBuffer ()));
    }
  } // generate

  console.log ("Loading...");
  let json = JSON.parse (await fs.readFile (kgmapFileName));
  let def = json.fonts.parts[partKey];
  if (!def) throw new Error ("Bad argument: |"+partKey+"|");

  let inFonts = {};
  for (let key of def.source_keys) {
    console.log ("Loading |"+key+"|...");
    let fd = json.fonts.sources[key];
    if (fd.type === 'eg') {
      inFonts[key] = await getEGFont ("data/" + fd.file_name);
    } else if (fd.type === 'ep') {
      inFonts[key] = await getEPFont ("fonts/" + fd.file_name, fd.allowed_legal_keys);
    } else {
      let ot = await getOT ("fonts/" + fd.file_name);
      inFonts[key] = getSourceFont (ot, {
        useHheaMetrics: fd.use_hhea_metrics,
        licenseText: fd.license_text,
        licenseAdditionalText: fd.license_additional_text,
        licenseSourceWebSite: fd.license_source_web_site,
      });
      inFonts[key].reHeight = fd.recompute_height;
      inFonts[key].reWidth = fd.recompute_width;
      if (fd.type === 'gw') {
        let json = JSON.parse (await fs.readFile (fd.glyph_names_file_name));
        inFonts[key].names = json.chars[""].vs.sort ((a, b) => a < b ? -1 : +1);
      }
    }
  } // key
  inFonts.base = inFonts[def.baseFontKey];
  
  console.log ("Processing...");
  await generate ((df) => {
  }, inFonts, {
    notdef: true,
    ascii: false,
    fontName: def.name,
    otfPath: "data/" + def.outFileName,
    licenseText: def.license_text,
    licenseURL: def.license_url,
    defs: json,
  });
}) (process.argv[2], process.argv[3]);

/*

Copyright 2024-2026 Wakaba <wakaba@suikawiki.org>.

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
