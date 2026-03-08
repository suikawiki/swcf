(function (global, init) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = init ();
  } else {
    global.OTWriter = init ();
  }
}) (globalThis, function () {

  function OTWriter () {
    this.currentOffset = 0;
    this.abs = [];
    this.bookmarks = [];
  } // OTWriter

  OTWriter.prototype.getArrayBufferList = function () {
    return this.abs;
  }; // getArrayBufferList

  OTWriter.prototype.setBookmark = function () {
    this.bookmarks.push (this.currentOffset);
  }; // setBookmark

  OTWriter.prototype.getBookmarks = function () {
    return this.bookmarks;
  }; // getBookmarks

  OTWriter.prototype.startTable = function (refs) {
    let tableStartOffset = this.currentOffset;
    let thisRef = new TableRef (tableStartOffset);

    refs.forEach (ref => {
      ref.fillOffset (tableStartOffset);
    });

    return thisRef;
  }; // startTable

  OTWriter.prototype.startList = function () {
    return new ListRef ();
  };

  OTWriter.prototype.add = function (items) {
    let size = 0;
    items.forEach (item => {
      if (!item) return;
      
      let type = item[0];
      if (type === 'uint8') {
        size += 1;
      } else if (type === 'uint16' || type === 'int16' ||
                 type === 'Offset16' || type === '_index') {
        size += 2;
      } else if (type === 'uint24') {
        size += 3;
      } else if (type === 'uint32' || type === 'int32' ||
                 type === 'Offset32' || type === 'Tag') {
        size += 4;
      } else {
        throw new TypeError ("Bad field type: " + type);
      }
    });
    let ab = new ArrayBuffer (size);
    let ab8 = new Uint8Array (ab);
    let ab8Offset = 0;
    items.forEach (item => {
      if (!item) return;
      
      let type = item[0];
      if (type === 'uint8') {
        ab8[ab8Offset++] = item[1] & 0xFF;
      } else if (type === 'uint16') {
        ab8[ab8Offset++] = (item[1] >> 8) & 0xFF;
        ab8[ab8Offset++] = item[1] & 0xFF;
      } else if (type === 'int16') {
        let v = item[1];
	if (v >= 32768) {
	  v = -(2 * 32768 - v);
	}
        ab8[ab8Offset++] = (v >> 8) & 0xFF;
        ab8[ab8Offset++] = v & 0xFF;
      } else if (type === 'uint24') {
        ab8[ab8Offset++] = (item[1] >> 16) & 0xFF;
        ab8[ab8Offset++] = (item[1] >> 8) & 0xFF;
        ab8[ab8Offset++] = item[1] & 0xFF;
      } else if (type === 'uint32') {
        ab8[ab8Offset++] = (item[1] >> 24) & 0xFF;
        ab8[ab8Offset++] = (item[1] >> 16) & 0xFF;
        ab8[ab8Offset++] = (item[1] >> 8) & 0xFF;
        ab8[ab8Offset++] = item[1] & 0xFF;
      } else if (type === 'int32') {
        let v = item[1];
	if (v >= 2147483648) {
	  v = -(2 * 2147483648 - v);
	}
        ab8[ab8Offset++] = (v >> 24) & 0xFF;
        ab8[ab8Offset++] = (v >> 16) & 0xFF;
        ab8[ab8Offset++] = (v >> 8) & 0xFF;
        ab8[ab8Offset++] = v & 0xFF;
      } else if (type === 'Offset16' || type === '_index') {
        item.ab8 = ab8;
        item.ab8Offset = ab8Offset;
        if (item.filledValue != null) {
          ab8[ab8Offset++] = (item.filledValue >> 8) & 0xFF;
          ab8[ab8Offset++] = item.filledValue & 0xFF;
        } else {
          ab8[ab8Offset++] = 0;
          ab8[ab8Offset++] = 0;
        }
      } else if (type === 'Offset32') {
        item.ab8 = ab8;
        item.ab8Offset = ab8Offset;
        ab8[ab8Offset++] = 0;
        ab8[ab8Offset++] = 0;
        ab8[ab8Offset++] = 0;
        ab8[ab8Offset++] = 0;
      } else if (type === 'Tag') {
        ab8[ab8Offset++] = item[1].charCodeAt (0) & 0xFF;
        ab8[ab8Offset++] = item[1].charCodeAt (1) & 0xFF;
        ab8[ab8Offset++] = item[1].charCodeAt (2) & 0xFF;
        ab8[ab8Offset++] = item[1].charCodeAt (3) & 0xFF;
      }
    });
    this.abs.push (ab);
    this.currentOffset += ab8Offset;
  }; // add

  OTWriter.prototype.addArrayBuffer = function (ab) {
    this.abs.push (ab);
    this.currentOffset += ab.byteLength;
  }; // addArrayBuffer

  OTWriter.prototype.addCoverage = function (objectList, refSet) {
    const table = this.startTable(refSet);

    function getSortedUniqueGlyphIds(objectList) {
      const allGids = objectList.flatMap(obj => {
        if (!obj) return [];
        return Object.keys (obj);
      });
      const uniqueGids = [...new Set(allGids)];
      return uniqueGids.map(gid => parseInt(gid, 10)).sort((a, b) => a - b);
    }

    function buildGlyphRanges(glyphIds) {
      const ranges = [];
      if (glyphIds.length > 0) {
        let start = glyphIds[0];
        let end = glyphIds[0];
        for (let i = 1; i < glyphIds.length; i++) {
          if (glyphIds[i] === end + 1) {
            end = glyphIds[i];
          } else {
            ranges.push ({ start, end });
            start = glyphIds[i];
            end = glyphIds[i];
          }
        }
        ranges.push ({ start, end });
      }
      return ranges;
    }

    const glyphIds = getSortedUniqueGlyphIds(objectList);
    
    const format1Size = 4 + glyphIds.length * 2; // header (4) + 2 bytes per GID

    const ranges = buildGlyphRanges (glyphIds);
    const format2Size = 4 + ranges.length * 6; // header (4) + 6 bytes per range

    if (format1Size <= format2Size) {
      this.add ([
        ['uint16', 1], // coverageFormat
        ['uint16', glyphIds.length], // glyphCount
        ...glyphIds.map (gid => ['uint16', gid]), // GlyphArray[]
      ]);
    } else {
      let startCoverageIndex = 0;
      const rangeFields = ranges.map (range => {
        const currentIndex = startCoverageIndex;
        startCoverageIndex += (range.end - range.start + 1);
        return [
          ['uint16', range.start], // startGlyphID
          ['uint16', range.end], // endGlyphID
          ['uint16', currentIndex], // startCoverageIndex
        ];
      });
      this.add ([
        ['uint16', 2], // coverageFormat
        ['uint16', ranges.length], // rangeCount
        ...rangeFields.flat (),
      ]);
    }
  }; // addCoverage

  OTWriter.prototype.addClassDefForMarks = function (objectList, refSet) {
    const table = this.startTable(refSet);

    function getSortedUniqueGlyphIds (objectList) {
      const allGids = objectList.flatMap (obj => {
        if (!obj) return [];
        return Object.keys (obj);
      });
      const uniqueGids = [...new Set (allGids)];
      return uniqueGids.map (gid => parseInt(gid, 10)).sort ((a, b) => a - b);
    }
    
    function buildGlyphRanges (glyphIds) {
      const ranges = [];
      if (glyphIds.length > 0) {
        let start = glyphIds[0];
        let end = glyphIds[0];
        for (let i = 1; i < glyphIds.length; i++) {
          if (glyphIds[i] === end + 1) {
            end = glyphIds[i];
          } else {
            ranges.push ({ start, end });
            start = glyphIds[i];
            end = glyphIds[i];
          }
        }
        ranges.push ({ start, end });
      }
      return ranges;
    }

    const glyphIds = getSortedUniqueGlyphIds (objectList);
    const ranges = buildGlyphRanges (glyphIds);
    
    this.add ([
      ['uint16', 2], // classFormat
      ['uint16', ranges.length], // classRangeCount
      ...ranges.flatMap (range => [
        ['uint16', range.start], // startGlyphID
        ['uint16', range.end], // endGlyphID
        ['uint16', 3], // classValue (3 = Mark)
      ]),
    ]);
  }; // addClassDefForMarks

  OTWriter.prototype._addLookup = function (subInputs, code, opts) {
    let r = {laters: []};
    
    let lookupTable = this.startTable (opts.ref.table);
    let subs = [];
    subInputs.forEach (input => {
      let item = {
        input: input,
        coverageRefSet: [],
        ref: lookupTable.offset16 ([], opts.ref.labels.concat (['subtable'])),
      };
      if (!opts.extension) item.realRef = item.ref;
      subs.push (item);
    });

    let lookupFlag = 0;
    if (opts.markFilteringSet != null) {
      lookupFlag |= 0x0010; // USE_MARK_FILTERING_SET
    }

    if (opts.extension) {
      this.add ([
        ['uint16', opts.extension === 'GSUB' ? 7 : 9], // lookupType
        ['uint16', lookupFlag], // lookupFlag
        ['uint16', subs.length], // subtableCount
        ...subs.map (_ => _.ref), // subtableOffsets[]
        ...(lookupFlag & 0x0010 ? [['uint16', opts.markFilteringSet]] : []), // markFilteringSet
      ]);
      subs.forEach (_ => {
        let subtable = this.startTable ([_.ref]);
        _.realRef = subtable.offset32 ([], opts.ref.labels.concat (['extensionOffset']));
        this.add ([
          ['uint16', 1], // format
          ['uint16', opts.lookupType], // extensionLookupType
          _.realRef,
        ]);
      });
    } else {
      this.add ([
        ['uint16', opts.lookupType], // lookupType
        ['uint16', lookupFlag], // lookupFlag
        ['uint16', subs.length], // subtableCount
        ...subs.map (_ => _.realRef), // subtableOffsets[]
        ...(lookupFlag & 0x0010 ? [['uint16', opts.markFilteringSet]] : []), // markFilteringSet
      ]);
    }

    if (opts.extension) {
      r.laters.push (() => subs.forEach (code));
    } else {
      subs.forEach (code);
    }

    return r;
  };
  
  OTWriter.prototype.addGSUBSingleLookup = function (subInputs, opts) {
    return this._addLookup (subInputs, _ => {
      let subtable = this.startTable ([_.realRef]);

      let substs = Object.values (_.input.map);
      this.add ([
        ['uint16', 2], // format
        subtable.offset16 (_.coverageRefSet, opts.ref.labels.concat (['coverageOffset'])),
        ['uint16', substs.length], // glyphCount
        ...substs.map (_ => {
          return ['uint16', _]; // substituteGlyphIDs[]
        }),
      ]);

      this.addCoverage ([_.input.map], _.coverageRefSet);
    }, {
      ...opts,
      lookupType: 1,
      extension: opts.extension ? 'GSUB' : false,
    });
  }; // addGSUBSingleLookup          

  OTWriter.prototype.addGSUBMultipleLookup = function (subInputs, opts) {
    return this._addLookup (subInputs, _ => {
      let subtable = this.startTable ([_.realRef]);

      let seqs = Object.values (_.input.map).map (_ => {
        return {
          refSet: [],
          seq: _,
        };
      });

      this.add ([
        ['uint16', 1], // format
        subtable.offset16 (_.coverageRefSet, opts.ref.labels.concat (['coverageOffset'])),
        ['uint16', seqs.length], // sequenceCount

        ...seqs.map (_ => {
          return subtable.offset16 (_.refSet, opts.ref.labels.concat (['sequenceOffsets[]']));
        }),
      ]);

      seqs.forEach (_ => {
        let seqTable = this.startTable (_.refSet);
        this.add ([
          ['uint16', _.seq.length], // glyphCount
          ..._.seq.map (_ => ['uint16', _]), // substituteGlyphIDs[]
        ]);
      });

      this.addCoverage ([_.input.map], _.coverageRefSet);
    }, {
      ...opts,
      lookupType: 2,
      extension: opts.extension ? 'GSUB' : false,
    });
  }; // addGSUBMultipleLookup          

  OTWriter.prototype.addGSUBAlternateLookup = function (subInputs, opts) {
    return this._addLookup (subInputs, _ => {
      let subtable = this.startTable ([_.realRef]);

      let altSets = Object.values (_.input.map).map (_ => {
        return {
          refSet: [],
          altSet: _,
        };
      });

      this.add ([
        ['uint16', 1], // format
        subtable.offset16 (_.coverageRefSet, opts.ref.labels.concat (['coverageOffset'])),
        ['uint16', altSets.length], // alternateSetCount

        ...altSets.map (_ => {
          return subtable.offset16 (_.refSet, opts.ref.labels.concat (['alternateSetOffsets[]']));
        }),
      ]);

      altSets.forEach (_ => {
        let asTable = this.startTable (_.refSet);
        this.add ([
          ['uint16', _.altSet.length], // glyphCount
          ..._.altSet.map (_ => ['uint16', _]), // alternateGlyphIDs[]
        ]);
      });

      this.addCoverage ([_.input.map], _.coverageRefSet);
    }, {
      ...opts,
      lookupType: 3,
      extension: opts.extension ? 'GSUB' : false,
    });
  }; // addGSUBAlternateLookup          

  OTWriter.prototype.addGSUBLigatureLookup = function (subInputs, opts) {
    return this._addLookup (subInputs, _ => {
      let subtable = this.startTable ([_.realRef]);

      let ligSets = Object.values (_.input.map).map (_ => {
        return {
          refSet: [],
          ligSet: _,
        };
      });

      this.add ([
        ['uint16', 1], // format
        subtable.offset16 (_.coverageRefSet, opts.ref.labels.concat (['coverageOffset'])),
        ['uint16', ligSets.length], // ligatureSetCount

        ...ligSets.map (_ => {
          return subtable.offset16 (_.refSet, opts.ref.labels.concat (['ligatureSetOffsets[]']));
        }),
      ]);

      ligSets.forEach (_ => {
        let lsTable = this.startTable (_.refSet); // LigatureSet
        let ligs = _.ligSet.map (_ => {
          return {
            refSet: [],
            lig: _,
          };
        });
        this.add ([
          ['uint16', ligs.length], // ligatureCount
          ...ligs.map (_ => lsTable.offset16 (_.refSet, opts.ref.labels.concat (['ligatureOffsets[]']))),
        ]);
        ligs.forEach (_ => {
          let table = this.startTable (_.refSet); // Ligature
          this.add ([
            ['uint16', _.lig.ligatureGlyph], // ligatureGlyph
            ['uint16', _.lig.components.length + 1], // componentCount
            ..._.lig.components.map (_ => ['uint16', _]), // componentGlyphIDs[]
          ]);
        });
      });

      this.addCoverage ([_.input.map], _.coverageRefSet);
    }, {
      ...opts,
      lookupType: 4,
      extension: opts.extension ? 'GSUB' : false,
    });
  }; // addGSUBLigatureLookup          


  OTWriter.prototype.addGPOSSingleLookup = function (subInputs, opts) {
    return this._addLookup (subInputs, _ => {
      let subtable = this.startTable ([_.realRef]);

      let format = 0;
      if (_.input.xPlacement != null) format |= 0x0001;
      if (_.input.yPlacement != null) format |= 0x0002;
      if (_.input.xAdvance != null) format |= 0x0004;
      if (_.input.yAdvance != null) format |= 0x0008;
            
      this.add ([
        ['uint16', 1], // format
        subtable.offset16 (_.input.coverageRefSet, opts.ref.labels.concat (['coverageOffset'])),
        ['uint16', format], // valueFormat
              
        // valueRecord
        (format & 0x0001 ? ['int16', _.input.xPlacement] : null),
        (format & 0x0002 ? ['int16', _.input.yPlacement] : null),
        (format & 0x0004 ? ['int16', _.input.xAdvance] : null),
        (format & 0x0008 ? ['int16', _.input.yAdvance] : null),
      ]);
    }, {
      ...opts,
      lookupType: 1,
      extension: opts.extension ? 'GPOS' : false,
    });
  }; // addGPOSSingleLookup

  OTWriter.prototype.addGPOSMarkLookup = function (baseType, subInputs, opts) {
    return this._addLookup (subInputs, _ => {
      let subtable = this.startTable ([_.realRef]);

      let ref1 = subtable.offset16 ();
      let ref2 = subtable.offset16 (_.input.baseArrayRefSet);
      this.add ([
        ['uint16', 1], // format
        subtable.offset16 (_.input.markCoverageRefSet, opts.ref.labels.concat (['markCoverageOffset'])),
            // markCoverageOffset, mark1CoverageOffset
        subtable.offset16 (_.input.baseCoverageRefSet, opts.ref.labels.concat (['baseCoverageOffset'])),
            // baseCoverageOffset, mark2CoverageOffset
        ['uint16', 1], // markClassCount

        ref1, // markArrayOffset, mark1ArrayOffset
        ref2, // baseArrayOffset, mark2ArrayOffset
      ]);

      { // MarkArray
        let markArray = this.startTable ([ref1]);
        let fields = [
          ['uint16', _.input.markCoverageCount], // markCount
        ];
        for (let i = 0; i < _.input.markCoverageCount; i++) {
          fields.push ( // markRecords[]
            ['uint16', 0], // markClass
            markArray.offset16 (_.input.markAnchorRefSet, opts.ref.labels.concat (['markAnchorOffset'])),
          );
        }
        this.add (fields);
      }
      if (!_.input.baseArrayRefSet) { // BaseArray, Mark2Array
        let baseArray = this.startTable ([ref2]);
        let fields = [
          ['uint16', _.input.baseCoverageCount], // baseCount, mark2Count
        ];
        for (let i = 0; i < _.input.baseCoverageCount; i++) {
          fields.push ( // baseRecords[], mark2Records[]
            baseArray.offset16 (_.input.baseAnchorRefSet, opts.ref.labels.concat (['baseAnchorOffsets[0]']))
                // baseAnchorOffsets[0], mark2AnchorOffsets[0]
          );
        }
        this.add (fields);
      }
    }, {
      ...opts,
      lookupType: {
        base: 4, // mark-to-base attachment
        //ligature: 5, // mark-to-ligature attachment
        mark: 6, // mark-to-mark attachment
      }[baseType], // lookupType
      extension: opts.extension ? 'GPOS' : false,
    });
  }; // addGPOSMarkLookup

  OTWriter.prototype.addChainedSequenceContextLookup = function (subInputs, opts) {
    return this._addLookup (subInputs, _ => {
      let subtable = this.startTable ([_.realRef]);

      let bt = _.input.backtrackCoverageRefSets.map (_ => subtable.offset16 (_, opts.ref.labels.concat (['backtrack'])));
      let ip = _.input.inputCoverageRefSets.map (_ => subtable.offset16 (_, opts.ref.labels.concat (['input'])));
      let la = _.input.lookaheadCoverageRefSets.map (_ => subtable.offset16 (_, opts.ref.labels.concat (['lookahead'])));

      this.add ([
        ['uint16', 3], // format
        ['uint16', bt.length], // backtrackGlyphCount
        ...bt, // backtrackCoverageOffsets[]
        ['uint16', ip.length], // inputGlyphCount
        ...ip, // inputCoverageOffsets[]
        ['uint16', la.length], // lookaheadGlyphCount
        ...la, // lookaheadCoverageOffsets[]
        ['uint16', _.input.seqLookups.length], // seqLookupCount
        ..._.input.seqLookups.map (_ => { // seqLookupRecords[]
          return [
            ['uint16', _.sequenceIndex], // sequenceIndex
            _.ref ? subtable.index (_.ref.index, opts.ref.labels.concat (['lookupListIndex'])) : ['uint16', _.lookupListIndex], // lookupListIndex
          ];
        }).flat (),
      ]);
    }, {
      ...opts,
      lookupType: opts.GSUB ? 6 : 8,
      extension: opts.extension ? opts.GSUB ? 'GSUB' : 'GPOS' : false,
    });
  }; // addChainedSequenceContextLookup

  OTWriter.prototype._addGSUBGPOS = function (featureDefs, lookupRefs, tableType, opts) {
    if (Object.keys (featureDefs).length === 0) return;
    if (lookupRefs.length === 0) return;

    // GSUB / GPOS
    const thisTable = this.startTable ([]);

    const scriptListRef = [];
    const featureListRef = [];
    const lookupListRef = [];

    this.add ([
      ['uint16', 1], // majorVersion
      ['uint16', 0], // minorVersion
      thisTable.offset16 (scriptListRef, [tableType, 'scriptListOffset']),
      thisTable.offset16 (featureListRef, [tableType, 'featureListOffset']),
      thisTable.offset16 (lookupListRef, [tableType, 'lookupListOffset']),
    ]);

    {
      // ScriptList
      const scriptListTable = this.startTable (scriptListRef);

      const scriptRef = [];
      this.add ([
        ['uint16', 1], // scriptCount
        ['Tag', 'DFLT'],
        scriptListTable.offset16 (scriptRef, [tableType, 'ScriptList', 'scriptTable']),
      ]);

      // Script (DFLT)
      const langSysRef = [];
      const scriptTable = this.startTable (scriptRef);
      this.add ([
        scriptTable.offset16 (langSysRef, [tableType, 'Script', 'defaultLangSys']),
        ['uint16', 0], // langSysCount
      ]);
      
      // LangSys (DFLT default)
      this.startTable (langSysRef);
      this.add ([
        ['uint16', 0], // lookupOrder
        ['uint16', 0xFFFF], // reqFeatureIndex
        ['uint16', Object.keys (featureDefs).length], // featureCount
        ...Object.keys (featureDefs).map ((_, i) => ['uint16', i]),
      ]);
    }
    
    {
      const featureRecords = [];
      const featureTables = [];

      for (const tag in featureDefs) {
        const featureTableRef = [];
        featureRecords.push ({
          tag: tag,
          ref: featureTableRef,
        });
        featureTables.push ({
          ref: featureTableRef,
          lookupIndexPlaceholders: featureDefs[tag].map (_ => _.index),
        });
      }

      // FeatureList
      const featureListTable = this.startTable (featureListRef);
      this.add ([['uint16', featureRecords.length]]);

      for (const record of featureRecords) {
        this.add ([
          ['Tag', record.tag],
          featureListTable.offset16 (record.ref),
        ]);
      }

      for (const featureTable of featureTables) {
        const subTable = this.startTable (featureTable.ref);
        this.add ([
          ['uint16', 0], // featureParams
          ['uint16', featureTable.lookupIndexPlaceholders.length],
        ]);
        for (const indexPlaceholder of featureTable.lookupIndexPlaceholders) {
          this.add ([subTable.index (indexPlaceholder)]);
        }
      }
    }

    {
      // LookupList
      const lookupListTable = this.startTable (lookupListRef);
      const list = this.startList ();
      this.add ([['uint16', lookupRefs.length]]);
      for (const ref of lookupRefs) {
        this.add ([lookupListTable.offset16 (ref.table)]);
        list.push (ref.index);
      }
    }
  }; // addGSUBGPOS

  OTWriter.prototype.addGSUB = function (featureDefs, lookupRefs, opts) {
    this._addGSUBGPOS (featureDefs, lookupRefs, 'GSUB', opts);
  };

  OTWriter.prototype.addGPOS = function (featureDefs, lookupRefs, opts) {
    this._addGSUBGPOS (featureDefs, lookupRefs, 'GPOS', opts);
  };

  function TableRef (offset) {
    this.tableStartOffset = offset;
  } // TableRef

  TableRef.prototype.offset16 = function (list, labels) {
    let item = new Placeholder (this.tableStartOffset);
    item[0] = 'Offset16';
    if (list) list.push (item);
    item.labels = labels || [];
    return item;
  };
  TableRef.prototype.offset32 = function (list, labels) {
    let item = new Placeholder (this.tableStartOffset);
    item[0] = 'Offset32';
    if (list) list.push (item);
    item.labels = labels || [];
    return item;
  };
  
  TableRef.prototype.index = function (list, labels) {
    let item = new Placeholder ();
    item[0] = '_index';
    if (list) list.push (item);
    item.labels = labels || [];
    if (list.filledIndex != null) {
      item.filledValue = list.filledIndex;
    }
    return item;
  };

  function ListRef () {
    this.nextIndex = 0;
  } // ListRef

  ListRef.prototype.push = function (refs) {
    let index = this.nextIndex++;
  
    refs.forEach (ref => {
      ref.fillIndex (index);
    });
    refs.filledIndex = index;
  }; // push


  function Placeholder (offset) {
    this.tableStartOffset = offset; // or undefined
    //this[0] (type)
    //this.ab8
    //this.ab8Offset
    //this.filledValue
  }

  Placeholder.prototype.fillOffset = function (offset) {
    if (this.filledValue !== undefined) {
      throw new TypeError ('Second fillOffset invocation for the placeholder');
    }
    if (!this.ab8) {
      throw new TypeError ('Placeholder not added to table yet');
    }
    let delta = offset - this.tableStartOffset;
    this.filledValue = delta;
    if (this[0] === 'Offset16') {
      if (delta >= 2**16) throw new TypeError ('Bad offset value: |'+delta+'| in ' + this.labels);
      this.ab8[this.ab8Offset] = (delta >> 8) & 0xFF;
      this.ab8[this.ab8Offset + 1] = delta & 0xFF;
    } else if (this[0] === 'Offset32') {
      if (delta >= 2**32) throw new TypeError ('Bad offset value: |'+delta+'| in ' + this.labels);
      this.ab8[this.ab8Offset] = (delta >> 24) & 0xFF;
      this.ab8[this.ab8Offset + 1] = (delta >> 16) & 0xFF;
      this.ab8[this.ab8Offset + 2] = (delta >> 8) & 0xFF;
      this.ab8[this.ab8Offset + 3] = delta & 0xFF;
    } else {
      throw new TypeError ('Bad fillOffset invocation: ' + this[0]);
    }
  }; // fillOffset

  Placeholder.prototype.fillIndex = function (index) {
    if (this.filledValue !== undefined) {
      throw new TypeError ('Second fillIndex invocation for the placeholder: ' + this.labels);
    }
    if (!this.ab8) {
      throw new TypeError ('Placeholder not added to table yet: ' + this.labels);
    }
    this.filledValue = index;
    if (this[0] === '_index') {
      if (index >= 2**16) throw new TypeError ('Bad index value: |'+index+'| in ' + this.labels);
      this.ab8[this.ab8Offset] = (index >> 8) & 0xFF;
      this.ab8[this.ab8Offset + 1] = index & 0xFF;
    } else {
      throw new TypeError ('Bad fillIndex invocation: ' + this[0] + ' / ' + this.labels);
    }
  }; // fillIndex

  Placeholder.prototype.getValue = function () {
    if (this.filledValue === undefined) {
      throw new TypeError ('No filled value for the placeholder');
    }
    return this.filledValue;
  };

  return OTWriter;
});

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
