/* HidroCalc Naval — importador semântico de tabelas de offsets.
 * Esta camada conhece arquivos e planilhas; o núcleo hidrostático recebe apenas
 * offsets canônicos { station, z, b, stationLabel, source } em metros. */
(() => {
  'use strict';

  const EPS=1e-8;
  const MISSING=new Set(['','-','—','–','n/a','na','null','.','*']);
  const UNITS={m:{factor:1,label:'m'},mm:{factor:.001,label:'mm'},cm:{factor:.01,label:'cm'},ft:{factor:.3048,label:'ft'},in:{factor:.0254,label:'in'}};
  const ADAPTERS=[];
  const text=value=>String(value??'').trim();
  const missing=value=>MISSING.has(text(value).toLowerCase());
  const finite=value=>Number.isFinite(value);
  const close=(a,b)=>Math.abs(a-b)<=Math.max(EPS,Math.abs(a)*1e-7);
  const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
  const columnName=index=>{let value=index+1,name='';while(value){value--;name=String.fromCharCode(65+value%26)+name;value=Math.floor(value/26);}return name;};

  function parseNumber(value){
    const original=text(value),match=original.match(/[-+]?\d[\d\s.,]*(?:e[-+]?\d+)?/i);
    if(!match)return NaN;
    let token=match[0].replace(/[\s\u00a0]/g,''),commas=(token.match(/,/g)||[]).length,dots=(token.match(/\./g)||[]).length;
    const normalizeRepeated=separator=>{const parts=token.split(separator),tail=parts.at(-1)||'',grouped=parts.slice(1).every(part=>part.length===3);if(grouped){token=parts.join('');return;}token=parts.slice(0,-1).join('')+'.'+tail;};
    if(commas&&dots){const comma=token.lastIndexOf(','),dot=token.lastIndexOf('.');token=comma>dot?token.replace(/\./g,'').replace(',','.'):token.replace(/,/g,'');}
    else if(commas===1)token=token.replace(',','.');
    else if(commas>1)normalizeRepeated(',');
    else if(dots>1)normalizeRepeated('.');
    const number=Number(token);return finite(number)?number:NaN;
  }
  function headerNumber(value){
    const direct=parseNumber(value);if(finite(direct))return direct;
    const tokens=text(value).match(/[+-]?(?:\d{1,3}(?:[ .]\d{3})+|\d+)(?:[.,]\d+)?(?:e[+-]?\d+)?/gi)||[];
    return tokens.length?parseNumber(tokens.at(-1)):NaN;
  }
  function detectUnit(value){
    const raw=text(value).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
    const has=(pattern)=>pattern.test(raw);
    if(has(/(?:^|[\s\[(])(mm|millimet(?:er|re)?s?|milimetros?)(?:$|[\s\])])/))return 'mm';
    if(has(/(?:^|[\s\[(])(cm|centimet(?:er|re)?s?|centimetros?)(?:$|[\s\])])/))return 'cm';
    if(has(/(?:^|[\s\[(])(ft|feet|foot|pe)(?:$|[\s\])])/))return 'ft';
    if(has(/(?:^|[\s\[(])(in|inch(?:es)?|polegadas?)(?:$|[\s\])])/))return 'in';
    if(has(/(?:^|[\s\[(])(m|met(?:er|re)?s?|metros?)(?:$|[\s\])])/))return 'm';
    return null;
  }
  function normalizeHeader(value){
    const raw=text(value),unit=detectUnit(raw),semantic=raw.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[\[(][^\])]*[\])]/g,' ').replace(/[_\-/.,:;]+/g,' ').replace(/\s+/g,' ').trim();
    return {raw,semantic,compact:semantic.replace(/[^a-z0-9]/g,''),unit};
  }
  function semanticField(value){
    const h=normalizeHeader(value),s=h.semantic,c=h.compact;
    if(!s)return {role:null,...h};
    if(/\b(port|bb|bombordo)\b/.test(s))return {role:'port',...h};
    if(/\b(starboard|stbd|be|boreste)\b/.test(s))return {role:'starboard',...h};
    if(c==='x'||/\b(posicao|position|distancia|distance|longitudinal|abscissa)\b/.test(s)||c.includes('stationposition')||c.includes('frameposition'))return {role:'x',...h};
    if(c==='z'||/^z\s*[=:]/.test(s)||/\b(cota|altura|height|level|nivel|ordinate height)\b/.test(s))return {role:'z',...h};
    if(/\b(bottom line|baseline|base line|keel line|linha de base|linha de fundo)\b/.test(s))return {role:'bottom',...h};
    if(/\b(wl|waterline|water line|linha d?agua)\b/.test(s))return {role:'wl',...h};
    if(c==='y'||c==='b'||/half\s*(breadth|beam)|semi\s*boca|semiboca|meia\s*boca|offset|ordinate|breadth from cl|distance from (cl|centerline)|linha de centro/.test(s))return {role:'half',...h};
    if(/full\s*(breadth|beam)|boca\s*total|largura\s*total|\bbeam\b|\bbreadth\b/.test(s))return {role:'full',...h};
    if(/\b(sta|station|stations|st|frame|frames|baliza|balizas|section|sections|secao|secoes)\b/.test(s)||c.includes('stano')||c.includes('stationno')||c.includes('frameno'))return {role:'label',...h};
    return {role:null,...h};
  }
  function splitLine(line,separator){
    const out=[],source=String(line??'');let cell='',quoted=false;
    for(let index=0;index<source.length;index++){const char=source[index];if(char==='"'){if(quoted&&source[index+1]==='"'){cell+='"';index++;}else quoted=!quoted;}else if(char===separator&&!quoted){out.push(cell.trim());cell='';}else cell+=char;}
    out.push(cell.trim());return out;
  }
  function separatorScore(lines,separator){
    const counts=lines.filter(line=>text(line)).slice(0,80).map(line=>splitLine(line,separator).length),multi=counts.filter(count=>count>1);
    if(multi.length<2)return -Infinity;
    const frequency=new Map();multi.forEach(count=>frequency.set(count,(frequency.get(count)||0)+1));const mode=[...frequency.entries()].sort((a,b)=>b[1]-a[1]||b[0]-a[0])[0]||[0,0];
    return mode[1]*8+mode[0]*2-multi.reduce((sum,count)=>sum+Math.abs(count-mode[0]),0)/Math.max(1,multi.length);
  }
  function detectSeparator(lines){
    const options=[';','\t','|',','].map(separator=>({separator,score:separatorScore(lines,separator)})).sort((a,b)=>b.score-a.score);
    return options[0]?.score>0?options[0].separator:null;
  }
  function buildRawGrid(source,options={}){
    if(Array.isArray(source))return source.map(row=>Array.isArray(row)?row.map(text):[]);
    const lines=String(source??'').replace(/^\uFEFF/,'').split(/\r?\n/),separator=options.separator||detectSeparator(lines);
    if(separator)return lines.map(line=>splitLine(line,separator));
    return lines.map(line=>text(line)?String(line).trim().split(/\s{2,}/):[]);
  }
  function detectTableRegions(rawGrid,options={}){
    const grid=(rawGrid||[]).map(row=>Array.isArray(row)?row.map(text):[]),minimum=options.minimumCells||2,active=grid.map(row=>{const filled=row.filter(value=>value!=='').length,semanticAnchor=row.some(value=>['label','x','z','wl'].includes(semanticField(value).role));return filled>=minimum||(filled===1&&semanticAnchor);}),ranges=[];let start=-1,last=-1;
    active.forEach((filled,row)=>{if(filled){if(start<0)start=row;last=row;}else if(start>=0&&row-last>2){ranges.push([start,last]);start=-1;}});if(start>=0)ranges.push([start,last]);
    return ranges.map(([rowStart,rowEnd])=>{let colStart=Infinity,colEnd=-1;for(let row=rowStart;row<=rowEnd;row++)(grid[row]||[]).forEach((value,column)=>{if(value!==''){colStart=Math.min(colStart,column);colEnd=Math.max(colEnd,column);}});if(!finite(colStart))return null;return {grid:grid.slice(rowStart,rowEnd+1).map(row=>Array.from({length:colEnd-colStart+1},(_,column)=>text(row[colStart+column]))),rowOffset:rowStart,colOffset:colStart,sheetName:options.sheetName||'CSV'};}).filter(Boolean);
  }
  function sourceCell(region,row,column,value){return {sheet:region.sheetName||'CSV',row:region.rowOffset+row+1,column:region.colOffset+column+1,columnLabel:columnName(region.colOffset+column),originalText:text(value)};}
  function regionFields(region){return region.grid.map(row=>row.map(semanticField));}
  function contiguousLevels(region,row,marker){
    const values=[];for(let column=marker+1;column<(region.grid[row]||[]).length;column++){const value=headerNumber(region.grid[row][column]);if(!finite(value)){if(values.length)break;continue;}values.push({column,value});}return values;
  }
  function findFields(fields,role,from=0,to=fields.length-1){const hits=[];for(let row=Math.max(0,from);row<=Math.min(to,fields.length-1);row++)fields[row].forEach((field,column)=>{if(field.role===role)hits.push({row,column,field});});return hits;}
  function firstField(fields,roles,from=0,to=fields.length-1){const hits=[];roles.forEach(role=>findFields(fields,role,from,to).forEach(hit=>hits.push(hit)));return hits.sort((a,b)=>a.row-b.row||a.column-b.column)[0]||null;}
  function makeCandidate(data){return {warnings:[],assumptions:[],evidence:[],emptyCells:[],breadthType:'half',units:{x:null,z:null,breadth:null},...data};}
  function matrixRows(region,config){
    const rows=[],emptyCells=[];for(let row=config.dataStart;row<region.grid.length;row++){
      const line=region.grid[row]||[],station=parseNumber(line[config.xColumn]);if(!finite(station))continue;
      const stationLabel=config.labelColumn>=0?text(line[config.labelColumn]):'';let observed=0;
      config.levels.forEach(level=>{const raw=line[level.column],b=parseNumber(raw);if(missing(raw)){emptyCells.push({station,z:level.value,stationLabel,reason:'empty',source:sourceCell(region,row,level.column,raw)});return;}if(finite(b)){rows.push({station,z:level.value,b,stationLabel,source:sourceCell(region,row,level.column,raw)});observed++;}});
      if(!observed&&!stationLabel)continue;
    }return {rows,emptyCells};
  }
  function adapterCanonical(region){
    const fields=regionFields(region),candidates=[];for(let header=0;header<Math.min(30,fields.length-1);header++){
      const row=fields[header],explicitX=row.findIndex(field=>field.role==='x'),z=row.findIndex(field=>field.role==='z'),width=row.findIndex(field=>field.role==='half'||field.role==='full'),label=row.findIndex(field=>field.role==='label'),x=explicitX>=0?explicitX:label;
      // "station" is only a physical X fallback when no separate X column exists.
      // If an X column is present, the station label remains metadata and is never
      // silently reinterpreted as a longitudinal coordinate.
      if([x,z,width].some(index=>index<0))continue;const rows=[],emptyCells=[];
      for(let index=header+1;index<region.grid.length;index++){const line=region.grid[index],station=parseNumber(line[x]),level=parseNumber(line[z]),b=parseNumber(line[width]);if(!finite(station)||!finite(level))continue;if(missing(line[width]))emptyCells.push({station,z:level,stationLabel:label>=0?text(line[label]):'',reason:'empty',source:sourceCell(region,index,width,line[width])});else if(finite(b))rows.push({station,z:level,b,stationLabel:label>=0?text(line[label]):'',source:sourceCell(region,index,width,line[width])});}
      const canonicalContract=x===label&&row[x]?.compact==='station'&&row[z]?.compact==='z'&&['halfbreadth','semiboca','meiaboca'].includes(row[width]?.compact),canonicalUnits={x:row[x].unit||'m',z:row[z].unit||'m',breadth:row[width].unit||'m'};
      if(rows.length>=4)candidates.push(makeCandidate({type:'canonical-list',format:'Lista canônica X, Z e semi-boca',baseConfidence:canonicalContract?.995:.97,rows,emptyCells,breadthType:row[width].role==='full'?'full':'half',units:canonicalContract?canonicalUnits:{x:row[x].unit,z:row[z].unit,breadth:row[width].unit},unitPolicy:canonicalContract?'canonical-si':null,mapping:{stationLabel:label>=0?'coluna '+columnName(region.colOffset+label):'—',x:'coluna '+columnName(region.colOffset+x),z:'coluna '+columnName(region.colOffset+z),offsets:'coluna '+columnName(region.colOffset+width)},parserConfig:{adapter:'canonical',xColumn:x,zColumn:z,widthColumn:width,dataStartRow:header+1},evidence:[canonicalContract?'Contrato canônico station,z,half_breadth: SI (m) por definição, salvo unidade declarada.':'Cabeçalhos explícitos X, Z e '+(row[width].role==='full'?'boca total':'semi-boca')+'.'],region}));
    }return candidates;
  }
  function adapterMultiHeader(region){
    const fields=regionFields(region),candidates=[],hasExplicitZ=fields.some(row=>row.some(field=>field.role==='z'));for(let zRow=0;zRow<Math.min(28,fields.length-1);zRow++){
      // WL is only a waterline label when a physical Z row exists in the same
      // table.  It must never compete with that explicit vertical coordinate.
      const zMarkers=fields[zRow].map((field,column)=>({field,column})).filter(item=>item.field.role==='z'||(!hasExplicitZ&&item.field.role==='wl'));
      zMarkers.forEach(marker=>{const levels=contiguousLevels(region,zRow,marker.column);if(levels.length<2)return;
        for(let infoRow=zRow+1;infoRow<=Math.min(fields.length-1,zRow+7);infoRow++){
          const row=fields[infoRow],x=row.findIndex(field=>field.role==='x'),width=row.findIndex(field=>field.role==='half'||field.role==='full');if(x<0||width<0)continue;
          const labelHit=firstField(fields,['label'],Math.max(0,zRow-3),infoRow),valid=levels.filter(level=>level.column>Math.max(x,width-1));if(valid.length<2)continue;
          const data=matrixRows(region,{xColumn:x,labelColumn:labelHit?labelHit.column:-1,levels:valid,dataStart:infoRow+1});if(data.rows.length<4)continue;
          const physical=marker.field.role==='z',headerRows=[...new Set([zRow,infoRow,labelHit?.row].filter(finite))].sort((a,b)=>a-b);
          candidates.push(makeCandidate({type:'multi-header-matrix',format:'Matriz de offsets com cabeçalho multinível',baseConfidence:physical?.965:.82,rows:data.rows,emptyCells:data.emptyCells,breadthType:row[width].role==='full'?'full':'half',units:{x:row[x].unit,z:marker.field.unit,breadth:row[width].unit},mapping:{stationLabel:labelHit?'coluna '+columnName(region.colOffset+labelHit.column):'—',x:'coluna '+columnName(region.colOffset+x),z:'linha '+(region.rowOffset+zRow+1)+' ('+(marker.field.raw||'Z')+'), colunas '+columnName(region.colOffset+valid[0].column)+'–'+columnName(region.colOffset+valid.at(-1).column),offsets:'linhas '+(region.rowOffset+infoRow+2)+'–'+(region.rowOffset+region.grid.length)},parserConfig:{adapter:'multi',xColumn:x,labelColumn:labelHit?labelHit.column:-1,zHeaderRow:zRow,offsetStartColumn:valid[0].column,dataStartRow:infoRow+1,levelColumns:valid.map(level=>level.column),headerRows,zRole:physical?'physical':'waterline'},evidence:[physical?'Linha Z explícita define as cotas físicas.':'WL tratado como identificador de linha d’água.',row[width].role==='full'?'Boca total declarada.':'Semi-boca declarada.'],region}));
        }
      });
    }return candidates;
  }
  function adapterPairedWaterlineZMatrix(region){
    const fields=regionFields(region),candidates=[];if(fields.some(row=>row.some(field=>field.role==='z')))return candidates;
    for(let wlRow=0;wlRow<Math.min(24,fields.length-2);wlRow++){
      const marker=fields[wlRow].findIndex(field=>field.role==='wl');if(marker<0)continue;
      const wlLevels=contiguousLevels(region,wlRow,marker);if(wlLevels.length<2)continue;
      for(let zRow=wlRow+1;zRow<=Math.min(wlRow+3,fields.length-1);zRow++){
        if(zRow>wlRow+1&&!fields[zRow].some(field=>field.role==='z'||field.role==='label'))continue;
        const levels=wlLevels.map(level=>({column:level.column,value:headerNumber(region.grid[zRow]?.[level.column])}));
        if(levels.filter(level=>finite(level.value)).length<2)continue;
        const valid=levels.filter(level=>finite(level.value));
        const dataStart=zRow+1;
        let xColumn=-1,labelColumn=-1,bestCoverage=-1;
        for(let column=0;column<valid[0].column;column++){
          const coverage=region.grid.slice(dataStart).filter(line=>finite(parseNumber(line?.[column]))).length;
          if(coverage>bestCoverage||(coverage===bestCoverage&&column>xColumn)){bestCoverage=coverage;xColumn=column;}
        }
        if(xColumn<0||bestCoverage<2)continue;
        for(let column=0;column<xColumn;column++)if(fields[zRow][column]?.role==='label'||fields[wlRow][column]?.role==='label'){labelColumn=column;break;}
        const data=matrixRows(region,{xColumn,labelColumn,levels:valid,dataStart});if(data.rows.length<4)continue;
        const labelHint=labelColumn>=0?'coluna '+columnName(region.colOffset+labelColumn):'—';
        candidates.push(makeCandidate({type:'paired-wl-z-matrix',format:'Matriz de offsets com WL e cotas Z pareadas',baseConfidence:.96,rows:data.rows,emptyCells:data.emptyCells,mapping:{stationLabel:labelHint,x:'coluna '+columnName(region.colOffset+xColumn)+' (X implícito confirmado pelos dados)',z:'linha '+(region.rowOffset+zRow+1)+' (cotas físicas pareadas a WL)',waterline:'linha '+(region.rowOffset+wlRow+1)+' (índices WL)',offsets:'matriz nas colunas '+columnName(region.colOffset+valid[0].column)+'–'+columnName(region.colOffset+valid.at(-1).column)},parserConfig:{adapter:'paired-wl-z',xColumn,labelColumn,zHeaderRow:zRow,wlHeaderRow:wlRow,offsetStartColumn:valid[0].column,dataStartRow:dataStart,levelColumns:valid.map(level=>level.column),headerRows:[wlRow,zRow],zRole:'physical',implicitX:true},evidence:['Linha WL identificada como metadado de linhas d’água.','Linha numérica pareada define as cotas Z físicas.','Posição X inferida da coluna numérica adjacente à matriz.'],region}));
      }
    }return candidates;
  }
  function adapterWide(region){
    const fields=regionFields(region),candidates=[];for(let header=0;header<Math.min(28,fields.length-1);header++){
      const row=fields[header],explicitX=row.findIndex(field=>field.role==='x'),label=row.findIndex(field=>field.role==='label'),x=explicitX>=0?explicitX:label;if(x<0)continue;const levels=[];for(let column=x+1;column<region.grid[header].length;column++){const field=row[column],value=field?.role==='bottom'?0:headerNumber(region.grid[header][column]);if(finite(value))levels.push({column,value});else if(levels.length)break;}if(levels.length<2)continue;
      const data=matrixRows(region,{xColumn:x,labelColumn:label!==x?label:-1,levels,dataStart:header+1});if(data.rows.length<4)continue;const width=row.find(field=>field.role==='half'||field.role==='full');
      const hasBottomLine=levels.some(level=>row[level.column]?.role==='bottom'),metricMatrix=row[x]?.unit==='m'&&levels.every(level=>level.value>=0&&level.value<=80)&&Math.max(...data.rows.map(item=>Math.abs(item.b)),0)<=150;
      candidates.push(makeCandidate({type:'wide-matrix',format:'Matriz de offsets (estações × níveis)',baseConfidence:width?.role==='full'?.92:hasBottomLine?.96:.88,rows:data.rows,emptyCells:data.emptyCells,breadthType:width?.role==='full'?'full':'half',units:{x:row[x].unit,z:row.find(field=>field.role==='z')?.unit||(metricMatrix?'m':null),breadth:width?.unit||(metricMatrix?'m':null)},unitPolicy:metricMatrix?'metric-matrix-context':null,mapping:{stationLabel:label>=0&&label!==x?'coluna '+columnName(region.colOffset+label):'—',x:'coluna '+columnName(region.colOffset+x),z:'linha '+(region.rowOffset+header+1),offsets:'matriz à direita de '+columnName(region.colOffset+x)},parserConfig:{adapter:'wide',xColumn:x,headerRow:header,dataStartRow:header+1,levelColumns:levels.map(level=>level.column),zRole:'physical'},evidence:['Matriz retangular com estações nas linhas e níveis no cabeçalho.',...(hasBottomLine?['Bottom Line declarado como z = 0.']:[]),...(metricMatrix?['Contexto métrico: X (m) e níveis físicos coerentes; Z e semi-boca em m.']:[])],region}));
    }return candidates;
  }
  function adapterTransposed(region){
    const fields=regionFields(region),candidates=[];for(let header=0;header<Math.min(28,fields.length-1);header++){
      const row=fields[header],z=row.findIndex(field=>field.role==='z');if(z<0)continue;const stations=[];for(let column=0;column<region.grid[header].length;column++){if(column===z)continue;const station=headerNumber(region.grid[header][column]);if(finite(station))stations.push({column,value:station});}if(stations.length<2)continue;
      const rows=[],emptyCells=[];for(let index=header+1;index<region.grid.length;index++){const level=parseNumber(region.grid[index][z]);if(!finite(level))continue;stations.forEach(item=>{const raw=region.grid[index][item.column],b=parseNumber(raw);if(missing(raw))emptyCells.push({station:item.value,z:level,reason:'empty',source:sourceCell(region,index,item.column,raw)});else if(finite(b))rows.push({station:item.value,z:level,b,source:sourceCell(region,index,item.column,raw)});});}
      if(rows.length>=4)candidates.push(makeCandidate({type:'transposed-matrix',format:'Matriz transposta (Z × estações)',baseConfidence:.89,rows,emptyCells,mapping:{x:'linha '+(region.rowOffset+header+1),z:'coluna '+columnName(region.colOffset+z),offsets:'matriz abaixo do cabeçalho'},parserConfig:{adapter:'transposed',zColumn:z,headerRow:header,dataStartRow:header+1},evidence:['Z explícito em coluna e posições X no cabeçalho.'],region}));
    }return candidates;
  }
  function adapterStationBlocks(region){
    const rows=[],emptyCells=[],fields=regionFields(region);let current=null,found=0;
    for(let row=0;row<region.grid.length;row++){
      const line=region.grid[row],joined=line.join(' '),stationHit=line.map(semanticField).find(field=>field.role==='label');
      if(stationHit){const xMatch=joined.match(/\b(?:x|posicao)\s*[=:]?\s*([-+]?\d+(?:[.,]\d+)?)/i),labelMatch=joined.match(/\b(?:baliza|station|frame|section)\s*([A-Za-z0-9.\-]+)/i);if(xMatch){current={station:parseNumber(xMatch[1]),label:labelMatch?.[1]||'',header:null};found++;continue;}}
      if(!current)continue;const fieldRow=fields[row],z=fieldRow.findIndex(field=>field.role==='z'),width=fieldRow.findIndex(field=>field.role==='half'||field.role==='full');if(z>=0&&width>=0){current.header={z,width,full:fieldRow[width].role==='full'};continue;}
      if(!current.header)continue;const level=parseNumber(line[current.header.z]),b=parseNumber(line[current.header.width]);if(!finite(level))continue;if(missing(line[current.header.width]))emptyCells.push({station:current.station,z:level,stationLabel:current.label,reason:'empty',source:sourceCell(region,row,current.header.width,line[current.header.width])});else if(finite(b))rows.push({station:current.station,z:level,b,stationLabel:current.label,source:sourceCell(region,row,current.header.width,line[current.header.width])});
    }
    return rows.length>=4?[makeCandidate({type:'station-blocks',format:'Blocos por baliza',baseConfidence:found>=2?.9:.75,rows,emptyCells,mapping:{stationLabel:'rótulo do bloco',x:'X declarado em cada bloco',z:'coluna Z em bloco',offsets:'coluna de semi-boca em bloco'},parserConfig:{adapter:'station-blocks'},evidence:['Blocos de baliza com X físico declarado.'],region})]:[];
  }
  function adapterWaterlineBlocks(region){
    const rows=[],emptyCells=[],fields=regionFields(region);let current=null,found=0;
    for(let row=0;row<region.grid.length;row++){
      const joined=region.grid[row].join(' '),zMatch=joined.match(/\b(?:z|cota|level)\s*[=:]?\s*([-+]?\d+(?:[.,]\d+)?)/i);if(zMatch){current={z:parseNumber(zMatch[1]),header:null};found++;continue;}
      if(!current)continue;const fieldRow=fields[row],x=fieldRow.findIndex(field=>field.role==='x'),width=fieldRow.findIndex(field=>field.role==='half'||field.role==='full');if(x>=0&&width>=0){current.header={x,width};continue;}if(!current.header)continue;const station=parseNumber(region.grid[row][current.header.x]),b=parseNumber(region.grid[row][current.header.width]);if(!finite(station))continue;if(missing(region.grid[row][current.header.width]))emptyCells.push({station,z:current.z,reason:'empty',source:sourceCell(region,row,current.header.width,region.grid[row][current.header.width])});else if(finite(b))rows.push({station,z:current.z,b,source:sourceCell(region,row,current.header.width,region.grid[row][current.header.width])});
    }
    return rows.length>=4?[makeCandidate({type:'waterline-blocks',format:'Blocos por linha d’água',baseConfidence:found>=2?.88:.73,rows,emptyCells,mapping:{x:'coluna X em bloco',z:'Z declarado por bloco',offsets:'coluna de semi-boca'},parserConfig:{adapter:'waterline-blocks'},evidence:['Blocos com cota Z física declarada.'],region})]:[];
  }
  function adapterPortStarboard(region){
    const fields=regionFields(region),candidates=[];for(let header=0;header<Math.min(28,fields.length-1);header++){
      const row=fields[header],x=row.findIndex(field=>field.role==='x'),z=row.findIndex(field=>field.role==='z'),port=row.findIndex(field=>field.role==='port'),star=row.findIndex(field=>field.role==='starboard');if([x,z,port,star].some(index=>index<0))continue;
      const rows=[],differences=[];for(let index=header+1;index<region.grid.length;index++){const station=parseNumber(region.grid[index][x]),level=parseNumber(region.grid[index][z]),left=parseNumber(region.grid[index][port]),right=parseNumber(region.grid[index][star]);if(!finite(station)||!finite(level)||!finite(left)||!finite(right))continue;const a=Math.abs(left),b=Math.abs(right);differences.push(Math.abs(a-b));rows.push({station,z:level,b:(a+b)/2,source:sourceCell(region,index,star,region.grid[index][star]),portValue:left,starboardValue:right});}
      if(rows.length<4)continue;const asymmetry=differences.some(value=>value>Math.max(EPS,Math.max(...rows.map(item=>item.b))*1e-4));candidates.push(makeCandidate({type:'port-starboard',format:'Tabela BB/BE',baseConfidence:asymmetry?.35:.9,rows,critical:asymmetry?'asymmetry':null,warnings:asymmetry?['A tabela possui BB/BE assimétricos e excede o modelo simétrico atual. Escolha uma regra explícita no mapeamento assistido.']:[],mapping:{x:'coluna '+columnName(region.colOffset+x),z:'coluna '+columnName(region.colOffset+z),offsets:'média de BB/BE'},parserConfig:{adapter:'port-starboard',xColumn:x,zColumn:z,portColumn:port,starboardColumn:star,dataStartRow:header+1},evidence:[asymmetry?'Assimetria BB/BE detectada.':'BB/BE simétricos convertidos em semi-boca.'],region}));
    }return candidates;
  }
  function adapterNumericTriplets(region){
    const rows=[];region.grid.forEach((line,row)=>{const values=line.map((cell,column)=>({column,value:parseNumber(cell)})).filter(item=>finite(item.value));if(values.length===3)rows.push({station:values[0].value,z:values[1].value,b:values[2].value,source:sourceCell(region,row,values[2].column,line[values[2].column])});});
    return rows.length>=4?[makeCandidate({type:'numeric-triplets',format:'Triplets numéricos sem cabeçalho',baseConfidence:.5,rows,mapping:{x:'primeira coluna numérica',z:'segunda coluna numérica',offsets:'terceira coluna numérica'},warnings:['Não foram encontrados cabeçalhos semânticos; confirme a interpretação antes de importar.'],parserConfig:{adapter:'numeric-triplets'},region})]:[];
  }
  [adapterCanonical,adapterMultiHeader,adapterPairedWaterlineZMatrix,adapterWide,adapterTransposed,adapterStationBlocks,adapterWaterlineBlocks,adapterPortStarboard,adapterNumericTriplets].forEach(adapter=>ADAPTERS.push(adapter));

  function geometrySignature(candidate){const xs=[...new Set(candidate.rows.map(row=>row.station))].sort((a,b)=>a-b).map(value=>value.toPrecision(10)).join(','),zs=[...new Set(candidate.rows.map(row=>row.z))].sort((a,b)=>a-b).map(value=>value.toPrecision(10)).join(',');return xs+'|'+zs+'|'+candidate.rows.length;}
  function dimensionDiagnostics(candidate,controls){
    const expected={L:Number(controls?.L),B:Number(controls?.B),D:Number(controls?.D)},actual={L:candidate.xRange,B:candidate.bMax*2,D:candidate.zRange},checks=[],warnings=[];
    if(!controls?.projectDimensionsTouched)return {checks,warnings,used:false};
    Object.entries(actual).forEach(([key,value])=>{const target=expected[key];if(!finite(target)||target<=EPS||!finite(value))return;const relative=Math.abs(value-target)/Math.max(Math.abs(target),EPS),state=relative<=.1?'compatível':value>target?'excede':'parcial';checks.push({key,value,expected:target,state});if(state==='excede')warnings.push((key==='L'?'Comprimento':key==='B'?'Boca':'Pontal')+' extraído excede o controle informado; isso não altera a interpretação da tabela.');});
    return {checks,warnings,used:true};
  }
  function unitOptions(candidate,key){return candidate.units?.[key]?[candidate.units[key]]:['m','mm','cm','ft','in'];}
  function convertedMeasures(candidate,units){
    const x=UNITS[units.x],z=UNITS[units.z],breadth=UNITS[units.breadth],breadthFactor=breadth.factor*(candidate.breadthType==='full'?.5:1),rows=candidate.rows.map(row=>({station:row.station*x.factor,z:row.z*z.factor,b:row.b*breadthFactor,stationLabel:row.stationLabel||'',source:{...(row.source||{}),conversionApplied:[x.factor!==1?'X × '+x.factor:null,z.factor!==1?'Z × '+z.factor:null,breadthFactor!==1?'Y × '+breadthFactor:null].filter(Boolean).join(', ')||'nenhuma'}}));
    const stations=[...new Set(rows.map(row=>row.station))],levels=[...new Set(rows.map(row=>row.z))];return {rows,xRange:stations.length?Math.max(...stations)-Math.min(...stations):0,zRange:levels.length?Math.max(...levels)-Math.min(...levels):0,bMax:Math.max(0,...rows.map(row=>row.b))};
  }
  function intervalScore(value,idealMin,idealMax,outerMin,outerMax){if(!finite(value)||value<=0)return -.45;if(value>=idealMin&&value<=idealMax)return .1;if(value>=outerMin&&value<=outerMax)return .035;return -.26;}
  function unitPlausibility(measures,units,candidate){
    const {xRange,zRange,bMax}=measures,beam=bMax*2,ratioLB=xRange/Math.max(beam,EPS),ratioLD=xRange/Math.max(zRange,EPS),ratioBD=beam/Math.max(zRange,EPS),reasons=[];let score=.45;
    score+=intervalScore(xRange,3,1000,.25,10000);score+=intervalScore(zRange,.3,80,.01,500);score+=intervalScore(bMax,.05,150,.002,1000);
    if(ratioLB>=1&&ratioLB<=80)score+=.1;else if(ratioLB>=.25&&ratioLB<1)score-=.025;else score-=.18;
    if(ratioLD>=1&&ratioLD<=1000)score+=.055;else score-=.1;
    if(ratioBD>=2&&ratioBD<=12)score+=.075;
    // SI is a small, explicit prior only after every listed unit scale has been
    // evaluated.  It is not a silent "unknown = metre" conversion.
    if(!candidate.units?.x&&units.x==='m')score+=.035;if(!candidate.units?.z&&units.z==='m')score+=.012;if(!candidate.units?.breadth&&units.breadth==='m')score+=.03;
    reasons.push('hipótese X='+units.x+', Z='+units.z+', Y='+units.breadth+' gera L='+xRange.toPrecision(5)+' m, B='+beam.toPrecision(5)+' m e D='+zRange.toPrecision(5)+' m');
    return {score:Math.max(0,score),reasons};
  }
  function inferUnits(candidate){
    const hypotheses=[];unitOptions(candidate,'x').forEach(x=>unitOptions(candidate,'z').forEach(z=>unitOptions(candidate,'breadth').forEach(breadth=>{const units={x,z,breadth},measures=convertedMeasures(candidate,units),plausibility=unitPlausibility(measures,units,candidate);hypotheses.push({units,measures,score:plausibility.score,reasons:plausibility.reasons});})));hypotheses.sort((a,b)=>b.score-a.score);const best=hypotheses[0]||{units:{x:'m',z:'m',breadth:'m'},measures:convertedMeasures(candidate,{x:'m',z:'m',breadth:'m'}),score:0,reasons:[]},runnerUp=hypotheses[1],ambiguous=!!runnerUp&&runnerUp.score>=best.score-.018&&JSON.stringify(runnerUp.units)!==JSON.stringify(best.units);
    const inferred=Object.keys(best.units).filter(key=>!candidate.units?.[key]),unitNotes=inferred.length?['Unidades sem cabeçalho foram inferidas por escalas físicas e proporções geométricas: '+inferred.map(key=>key.toUpperCase()+'='+best.units[key]).join(', ')+'.']:[];
    if(ambiguous)unitNotes.push('Há uma segunda hipótese de unidade quase equivalente; confirme o mapeamento antes de importar.');
    return {...best,runnerUp,ambiguous,notes:unitNotes};
  }
  function normalizeCandidate(candidate,controls){
    const inference=inferUnits(candidate),unitScore=clamp(inference.score,0,1),{rows,xRange,zRange,bMax}=inference.measures,emptyCells=(candidate.emptyCells||[]).map(item=>({...item,station:item.station*UNITS[inference.units.x].factor,z:item.z*UNITS[inference.units.z].factor,source:{...(item.source||{}),conversionApplied:'nenhuma'}})),duplicates=[],coordinateMap=new Map();
    rows.forEach(row=>{const key=Math.round(row.station/EPS)+'|'+Math.round(row.z/EPS),previous=coordinateMap.get(key);if(previous)duplicates.push({station:row.station,z:row.z,values:[previous.b,row.b]});else coordinateMap.set(key,row);});
    const stations=[...new Set(rows.map(row=>row.station))],levels=[...new Set(rows.map(row=>row.z))],stationOrder=[...new Set(rows.map(row=>row.station))],outOfOrderX=stationOrder.some((station,index)=>index>0&&station<stationOrder[index-1]-EPS),negative=rows.filter(row=>row.b<0).length,coverage=rows.length/Math.max(1,stations.length*levels.length),dimension=dimensionDiagnostics({xRange,zRange,bMax},controls);
    let parserScore=candidate.baseConfidence+(rows.length>=12?.012:0)+(stations.length>=2&&levels.length>=2&&xRange>EPS&&zRange>EPS?.018:0);if(duplicates.length||negative||candidate.critical)parserScore-=.6;if(stations.length<2||levels.length<2)parserScore-=.5;
    const geometryScore=clamp(.55+(coverage>=.4?.2:coverage*.5)+(xRange>EPS&&zRange>EPS?.1:0)+(bMax>=0?.05:0)-(negative?.65:0)-(duplicates.length?.65:0),0,1),confidence=clamp(parserScore*.56+geometryScore*.22+unitScore*.22,0,1),warnings=[...(candidate.warnings||[]),...inference.notes,...dimension.warnings];
    if(candidate.breadthType==='full')warnings.push('Boca total declarada: valores divididos por 2 para semi-boca.');if(emptyCells.length)warnings.push(emptyCells.length+' célula(s) vazia(s) mantida(s) como ausente(s).');if(outOfOrderX)warnings.push('A ordem de X no arquivo não é monotônica; os valores foram preservados exatamente como fornecidos e o núcleo fará apenas a ordenação interna necessária para integrar.');if(duplicates.length)warnings.push('Foram encontrados offsets duplicados para a mesma coordenada X/Z.');
    const scoreReasons=[...(candidate.evidence||[]),'Estrutura '+Math.round(clamp(parserScore,0,1)*100)+'%; cobertura geométrica '+Math.round(geometryScore*100)+'%; coerência de unidade '+Math.round(unitScore*100)+'%.',...inference.reasons];
    return {...candidate,rows,emptyCells,duplicates,stationCount:stations.length,levelCount:levels.length,xRange,zRange,bMax,outOfOrderX,units:{x:inference.units.x,z:inference.units.z,breadth:inference.units.breadth},unitInference:{detected:{...candidate.units},selected:inference.units,score:unitScore,ambiguous:inference.ambiguous,runnerUp:inference.runnerUp?.units||null},validation:dimension,parserScore:clamp(parserScore,0,1),geometryScore,confidence,warnings,scoreReasons};
  }
  function physicalDominance(candidates){
    const physical=candidates.filter(candidate=>candidate.parserConfig?.zRole==='physical'&&!candidate.duplicates.length&&candidate.stationCount>=2&&candidate.levelCount>=2);
    return candidates.filter(candidate=>{
      const sameRegion=reference=>candidate.region?.sheetName===reference.region?.sheetName&&candidate.region?.rowOffset===reference.region?.rowOffset&&candidate.region?.colOffset===reference.region?.colOffset;
      const sameBlock=reference=>sameRegion(reference)&&candidate.parserConfig?.dataStartRow===reference.parserConfig?.dataStartRow&&candidate.parserConfig?.xColumn===reference.parserConfig?.xColumn;
      const headerAlias=reference=>sameRegion(reference)&&candidate.type==='wide-matrix'&&candidate.parserConfig?.headerRow>=reference.parserConfig?.zHeaderRow&&candidate.parserConfig?.headerRow<reference.parserConfig?.dataStartRow&&candidate.parserConfig?.dataStartRow<=reference.parserConfig?.dataStartRow;
      return !physical.some(reference=>(candidate.parserConfig?.zRole==='waterline'&&sameBlock(reference))||headerAlias(reference)||(candidate.type==='transposed-matrix'&&sameRegion(reference)));
    });
  }
  function decideImport(best,alternatives){
    if(!best)return {decision:'blocked',reason:'Nenhuma interpretação contém ao menos duas estações, dois níveis Z e quatro offsets.'};
    if(best.critical)return {decision:'blocked',reason:'A tabela BB/BE exige uma regra explícita de redução para o modelo simétrico.'};
    if(best.duplicates.length||best.rows.some(row=>row.b<0)||best.stationCount<2||best.levelCount<2)return {decision:'blocked',reason:'A interpretação selecionada contém duplicações, semi-boca negativa ou cobertura geométrica insuficiente.'};
    if(best.unitInference.ambiguous)return {decision:'review',reason:'As unidades sem cabeçalho possuem hipóteses físicas muito próximas.'};
    if(alternatives.length)return {decision:'review',reason:'Há duas interpretações estruturais distintas com evidência semelhante.'};
    return {decision:'auto',reason:'Cabeçalhos, matriz e coordenadas físicas são coerentes; nenhuma alternativa estrutural equivalente foi encontrada.'};
  }
  function selectCandidates(raw,controls){
    const normalized=raw.map(candidate=>normalizeCandidate(candidate,controls)).filter(candidate=>candidate.rows.length>=4),dominant=physicalDominance(normalized),byGeometry=new Map();dominant.forEach(candidate=>{const key=geometrySignature(candidate),previous=byGeometry.get(key);if(!previous||candidate.confidence>previous.confidence)byGeometry.set(key,candidate);});
    const candidates=[...byGeometry.values()].sort((a,b)=>b.confidence-a.confidence||b.rows.length-a.rows.length),best=candidates[0]||null,alternatives=best?candidates.filter(candidate=>candidate!==best&&candidate.confidence>=best.confidence-.045&&geometrySignature(candidate)!==geometrySignature(best)).slice(0,4):[],decision=decideImport(best,alternatives);
    return {candidates,best,alternatives,ambiguous:decision.decision==='review',decision,diagnostics:best?best.warnings:['Não encontrei uma região com X, Z e semi-boca suficientes.']};
  }
  function payloadFromAnalysis(analysis){
    const candidate=analysis.best;if(!candidate)throw new Error('Falha na interpretação da tabela: não encontrei um candidato com X, Z e semi-boca suficientes.');
    const maxColumns=Math.max(0,...candidate.region.grid.map(row=>row.length));
    const info={format:candidate.format,type:candidate.type,confidence:candidate.confidence,decision:analysis.decision?.decision||'review',decisionReason:analysis.decision?.reason||'A interpretação requer confirmação.',mapping:candidate.mapping,warnings:candidate.warnings,assumptions:candidate.assumptions,scoreReasons:candidate.scoreReasons,parserScore:candidate.parserScore,geometryScore:candidate.geometryScore,unitScore:candidate.unitInference?.score,unitInference:candidate.unitInference,units:candidate.units,breadthType:candidate.breadthType,stationCount:candidate.stationCount,levelCount:candidate.levelCount,pointCount:candidate.rows.length,emptyCount:candidate.emptyCells.length,validation:candidate.validation.checks,validationUsed:candidate.validation.used,headerRows:candidate.parserConfig?.headerRows||[],ambiguous:analysis.ambiguous,critical:candidate.critical||null,alternatives:analysis.alternatives.map(item=>({type:item.type,format:item.format,confidence:item.confidence,points:item.rows.length,levels:item.levelCount,reasons:item.scoreReasons})),candidates:analysis.candidates.slice(0,5).map(item=>({type:item.type,format:item.format,confidence:item.confidence,points:item.rows.length,levels:item.levelCount,reasons:item.scoreReasons})),sourceRange:{sheet:candidate.region.sheetName,rows:[candidate.region.rowOffset+1,candidate.region.rowOffset+candidate.region.grid.length],columns:[candidate.region.colOffset+1,candidate.region.colOffset+maxColumns]},preview:candidate.rows.slice(0,20)};
    return {rows:candidate.rows,emptyCells:candidate.emptyCells,format:candidate.format+' · confiança '+Math.round(candidate.confidence*100)+'%',importInfo:info,_importCandidate:candidate,_importAnalysis:analysis};
  }
  function analyzeGrid(grid,options={}){const regions=detectTableRegions(grid,options),raw=regions.flatMap(region=>ADAPTERS.flatMap(adapter=>adapter(region)));const selected=selectCandidates(raw,options.controls||{});return {...selected,regions,rawCandidates:raw};}
  function parseText(source,options={}){return payloadFromAnalysis(analyzeGrid(buildRawGrid(source,options),options));}
  function manualMappingGuess(region,candidate){
    const saved=candidate?.parserConfig;if(saved)return {xColumn:saved.xColumn??0,labelColumn:saved.labelColumn??-1,zHeaderRow:saved.zHeaderRow??saved.headerRow??0,zColumn:saved.zColumn??0,offsetStartColumn:saved.offsetStartColumn??0,dataStartRow:saved.dataStartRow??1,breadthType:candidate.breadthType||'half'};
    const fields=regionFields(region),find=roles=>firstField(fields,roles,0,Math.min(20,fields.length-1)),x=find(['x']),label=find(['label']),z=find(['z','wl']),breadth=find(['half','full']),zRow=z?.row??0,zColumn=z?.column??0,firstOffset=(region.grid[zRow]||[]).findIndex((cell,column)=>column>zColumn&&finite(headerNumber(cell))),dataStart=Math.min(region.grid.length-1,Math.max(x?.row??0,breadth?.row??0,zRow)+1);
    return {xColumn:x?.column??Math.max(0,(firstOffset>=2?firstOffset-1:0)),labelColumn:label?.column??-1,zHeaderRow:zRow,zColumn:zColumn,offsetStartColumn:firstOffset>=0?firstOffset:Math.max((x?.column??0),(breadth?.column??0))+1,dataStartRow:dataStart,breadthType:breadth?.field?.role==='full'?'full':'half'};
  }
  function applyManualMapping(region,config={},options={}){
    if(!region?.grid)throw new Error('Não há região de tabela disponível para o mapeamento assistido.');const format=config.format||'station-x-matrix',xColumn=Number(config.xColumn),labelColumn=Number(config.labelColumn),zControl=Number(config.zHeaderRow),offsetColumn=Number(config.offsetStartColumn),dataStart=Number(config.dataStartRow),breadthType=config.breadthType||'half',units={x:config.units?.x||'m',z:config.units?.z||'m',breadth:config.units?.breadth||'m'};let raw;
    if(format==='list'){
      const rows=[],emptyCells=[];for(let row=dataStart;row<region.grid.length;row++){const line=region.grid[row]||[],station=parseNumber(line[xColumn]),z=parseNumber(line[zControl]),b=parseNumber(line[offsetColumn]);if(!finite(station)||!finite(z))continue;if(missing(line[offsetColumn]))emptyCells.push({station,z,stationLabel:labelColumn>=0?text(line[labelColumn]):'',reason:'empty',source:sourceCell(region,row,offsetColumn,line[offsetColumn])});else if(finite(b))rows.push({station,z,b,stationLabel:labelColumn>=0?text(line[labelColumn]):'',source:sourceCell(region,row,offsetColumn,line[offsetColumn])});}
      raw=makeCandidate({type:'manual-list',format:'Lista de cotas mapeada manualmente',baseConfidence:.82,rows,emptyCells,breadthType,units,mapping:{stationLabel:labelColumn>=0?'coluna '+columnName(region.colOffset+labelColumn):'—',x:'coluna '+columnName(region.colOffset+xColumn),z:'coluna '+columnName(region.colOffset+zControl),offsets:'coluna '+columnName(region.colOffset+offsetColumn)},parserConfig:{adapter:'manual-list',xColumn,zColumn:zControl,widthColumn:offsetColumn,dataStartRow:dataStart},evidence:['Mapeamento confirmado manualmente pelo usuário.'],region});
    }else{
      const levels=(region.grid[zControl]||[]).map((cell,column)=>({column,value:headerNumber(cell)})).filter(level=>finite(level.value)&&level.column>=offsetColumn);if(levels.length<2)throw new Error('A linha escolhida não possui ao menos dois níveis Z numéricos a partir da coluna de offsets.');const data=matrixRows(region,{xColumn,labelColumn,levels,dataStart});raw=makeCandidate({type:'manual-station-x-matrix',format:'Matriz de offsets mapeada manualmente',baseConfidence:.84,rows:data.rows,emptyCells:data.emptyCells,breadthType,units,mapping:{stationLabel:labelColumn>=0?'coluna '+columnName(region.colOffset+labelColumn):'—',x:'coluna '+columnName(region.colOffset+xColumn),z:'linha '+(region.rowOffset+zControl+1),offsets:'linhas '+(region.rowOffset+dataStart+1)+'–'+(region.rowOffset+region.grid.length)},parserConfig:{adapter:'manual-matrix',xColumn,labelColumn,zHeaderRow:zControl,offsetStartColumn:offsetColumn,dataStartRow:dataStart,levelColumns:levels.map(level=>level.column),zRole:'physical'},evidence:['Mapeamento confirmado manualmente pelo usuário.'],region});
    }
    if(config.missingPolicy==='zero'){raw.rows.push(...raw.emptyCells.map(item=>({...item,b:0,source:{...(item.source||{}),conversionApplied:'célula vazia convertida explicitamente em zero'}})));raw.emptyCells=[];raw.warnings=['Células vazias foram convertidas explicitamente em zero pelo usuário.'];}
    else if(config.missingPolicy&&config.missingPolicy!=='missing')raw.warnings=['Células vazias foram preservadas como ausentes; nenhuma cota foi inventada pelo mapeamento assistido.'];
    return normalizeCandidate(raw,options.controls||{});
  }
  async function parseXlsx(file,options={}){
    const bytes=new Uint8Array(await file.arrayBuffer()),view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),decoder=new TextDecoder();let end=-1;for(let index=Math.max(0,bytes.length-65557);index<=bytes.length-4;index++)if(view.getUint32(index,true)===0x06054b50)end=index;if(end<0)throw new Error('O arquivo XLSX não possui estrutura ZIP válida.');
    const start=view.getUint32(end+16,true),size=view.getUint32(end+12,true),entries=new Map();let offset=start;while(offset<start+size){if(view.getUint32(offset,true)!==0x02014b50)throw new Error('Estrutura interna do XLSX inválida.');const method=view.getUint16(offset+10,true),compressedSize=view.getUint32(offset+20,true),nameLength=view.getUint16(offset+28,true),extraLength=view.getUint16(offset+30,true),commentLength=view.getUint16(offset+32,true),localOffset=view.getUint32(offset+42,true),name=decoder.decode(bytes.slice(offset+46,offset+46+nameLength));entries.set(name,{method,compressedSize,localOffset});offset+=46+nameLength+extraLength+commentLength;}
    async function entryText(name){
      const entry=entries.get(name);if(!entry)return '';const pointer=entry.localOffset;if(view.getUint32(pointer,true)!==0x04034b50)throw new Error('Entrada XLSX inválida.');const nameLength=view.getUint16(pointer+26,true),extraLength=view.getUint16(pointer+28,true),data=bytes.slice(pointer+30+nameLength+extraLength,pointer+30+nameLength+extraLength+entry.compressedSize);
      if(entry.method===0)return decoder.decode(data);
      if(entry.method===8&&window.pako?.inflateRaw)return decoder.decode(window.pako.inflateRaw(data));
      if(entry.method===8&&'DecompressionStream'in window){const stream=new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'));return decoder.decode(new Uint8Array(await new Response(stream).arrayBuffer()));}
      throw new Error('Compactação XLSX não suportada neste navegador (método '+entry.method+'; decodificador local '+(window.pako?.inflateRaw?'disponível':'indisponível')+').');
    }
    const xml=source=>{const doc=new DOMParser().parseFromString(source,'application/xml');if(doc.querySelector('parsererror'))throw new Error('Não foi possível ler o XML do XLSX.');return doc;},sharedRaw=await entryText('xl/sharedStrings.xml'),shared=sharedRaw?[...xml(sharedRaw).querySelectorAll('si')].map(item=>item.textContent||''):[],column=reference=>[...(reference.match(/[A-Z]+/i)||['A'])[0].toUpperCase()].reduce((total,letter)=>total*26+letter.charCodeAt(0)-64,0)-1,range=reference=>{const match=String(reference||'').match(/^([A-Z]+)(\d+):([A-Z]+)(\d+)$/i);return match?{left:column(match[1]),top:Number(match[2])-1,right:column(match[3]),bottom:Number(match[4])-1}:null;};
    const workbookRaw=await entryText('xl/workbook.xml'),workbook=workbookRaw?xml(workbookRaw):null,relationshipsRaw=await entryText('xl/_rels/workbook.xml.rels'),relationships=relationshipsRaw?xml(relationshipsRaw):null,relationshipTargets=new Map([...(relationships?.querySelectorAll('Relationship')||[])].map(item=>[item.getAttribute('Id'),item.getAttribute('Target')])),normalizeSheetPath=target=>{const clean=String(target||'').replace(/\\/g,'/').replace(/^\/+/, ''),parts=(clean.startsWith('xl/')?clean:'xl/'+clean).split('/'),out=[];parts.forEach(part=>{if(!part||part==='.')return;if(part==='..'){out.pop();return;}out.push(part);});return out.join('/');},fallbackSheets=[...entries.keys()].filter(name=>/^xl\/worksheets\/sheet\d+\.xml$/i.test(name)).sort(),sheetRefs=[...(workbook?.querySelectorAll('sheets > sheet')||[])].map(sheet=>{const relationId=sheet.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships','id')||sheet.getAttribute('r:id'),path=normalizeSheetPath(relationshipTargets.get(relationId));return {name:sheet.getAttribute('name')||path,path};}).filter(sheet=>entries.has(sheet.path));if(!sheetRefs.length)fallbackSheets.forEach(path=>sheetRefs.push({name:path,path}));if(!sheetRefs.length)throw new Error('Não encontrei abas de dados no XLSX.');let best=null;
    for(let sheetIndex=0;sheetIndex<sheetRefs.length;sheetIndex++){const sheetRef=sheetRefs[sheetIndex],sheetPath=sheetRef.path,doc=xml(await entryText(sheetPath)),grid=[];[...doc.querySelectorAll('sheetData > row')].forEach((row,rowIndex)=>{const rowNumber=Number(row.getAttribute('r')),target=finite(rowNumber)&&rowNumber>0?rowNumber-1:rowIndex,out=[];[...row.querySelectorAll(':scope > c')].forEach(cell=>{const reference=cell.getAttribute('r')||'A1',col=column(reference),type=cell.getAttribute('t'),raw=type==='inlineStr'?(cell.querySelector('is')?.textContent||''):(cell.querySelector('v')?.textContent||'');out[col]=type==='s'?(shared[Number(raw)]||''):raw;});grid[target]=out;});
      [...doc.querySelectorAll('mergeCells > mergeCell')].forEach(merge=>{const area=range(merge.getAttribute('ref'));if(!area)return;const value=text(grid[area.top]?.[area.left]);if(!value)return;for(let row=area.top;row<=area.bottom;row++){if(!grid[row])grid[row]=[];for(let col=area.left;col<=area.right;col++)if(text(grid[row][col])==='')grid[row][col]=value;}});
      const sheetName=sheetRef.name||sheetPath,analysis=analyzeGrid(grid,{...options,sheetName});if(analysis.best&&(!best||analysis.best.confidence>best.analysis.best.confidence||(close(analysis.best.confidence,best.analysis.best.confidence)&&analysis.best.rows.length>best.analysis.best.rows.length)))best={analysis,sheetName};
    }if(!best)throw new Error('Falha na interpretação da tabela: nenhuma aba contém uma geometria de offsets reconhecível.');const payload=payloadFromAnalysis(best.analysis);payload.format+=' · aba '+best.sheetName+' identificada automaticamente';payload.importInfo.sheetName=best.sheetName;return payload;
  }

  window.HydroOffsetImporter=Object.freeze({ADAPTERS:ADAPTERS.map(adapter=>adapter.name),buildRawGrid,detectTableRegions,semanticField,analyzeGrid,parseText,parseXlsx,payloadFromAnalysis,parseNumber,headerNumber,manualMappingGuess,applyManualMapping});
})();
