'use strict';

const fs = require('node:fs');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');

const assetRoot = '/app/packages/twenty-server/dist/front/assets/';
const patches = [
  {
    name: 'PinnedCommandMenuItemButtons-ByicrOXe.js',
    hash: '3322a39b622e51ccdc11d8a78d469bd9cdeb043065f1a4317378677b9b19e343',
    changes: [
      [
        'CP=B({key:"isRecordTableEmptyStateHiddenComponentState",defaultValue:!1,componentInstanceContext:Q}),Hc=',
        'CP=B({key:"isRecordTableEmptyStateHiddenComponentState",defaultValue:!1,componentInstanceContext:Q}),DashboardTableError20261012=B({key:"dashboardTableLoadError20261012",defaultValue:null,componentInstanceContext:Q}),Hc=',
      ],
      [
        'const l=o.direction===fr.ASC?"AscNullsFirst":"DescNullsLast";',
        'const l=o.direction===fr.ASC?s.type===V.DATE||s.type===V.DATE_TIME?"AscNullsLast":"AscNullsFirst":"DescNullsLast";',
      ],
      [
        'r=A(eC),o=A(qc),s=A(Ln,e),l=ve($e,e)',
        'r=A(eC),o=A(qc),s=A(Ln,e),T=A(DashboardTableError20261012,e),l=ve($e,e)',
      ],
      [
        'if(!d.get(r)){d.set(r,!0);try{d.set(s,!0)',
        'if(!d.get(r)){d.set(r,!0);try{T(null),d.set(s,!0)',
      ],
      [
        'w&&v({horizontalScrollInPx:0,verticalScrollInPx:0})}finally{d.set(r,!1),d.set(s,!1)}}}',
        'w&&v({horizontalScrollInPx:0,verticalScrollInPx:0})}catch(error){T(error);throw error}finally{d.set(r,!1),d.set(s,!1)}}}',
      ],
      [
        'p=zs();let I=l.canReadObjectRecords;',
        'p=zs(),W=x(CP);let I=l.canReadObjectRecords;',
      ],
      [
        'objectMetadataItem:o}),displayedMaxRows:1,isRecordFieldReadOnly:r||Ks(',
        'objectMetadataItem:o}),displayedMaxRows:W&&u.metadata.fieldName==="nextStep"?9999:1,isRecordFieldReadOnly:r||Ks(',
      ],
      [
        '{recordTableId:l}=U(),d=Oy(n,a),c=()=>{r()};return(0,i.jsx)(Nk,{onClick:c,',
        '{recordTableId:l}=U(),w=x(CP),d=Oy(n,a),c=()=>{r()};return(0,i.jsx)(Nk,{onClick:c,',
      ],
      [
        'isReadOnly:t??!1,id:Sa(l,s.column,s.row)',
        'isReadOnly:t??!1,"data-dashboard-next-step":w&&n.metadata.fieldName==="nextStep"?"true":void 0,id:Sa(l,s.column,s.row)',
      ],
      [
        'u1=()=>{const{recordTableId:e,objectNameSingular:t,objectMetadataItem:n,visibleRecordFields:a}=U()',
        'DashboardEmptyState20261012=({error:e})=>{const t=(0,f.useRef)(null),[n,a]=(0,f.useState)("");return(0,f.useEffect)(()=>{a(t.current?.closest(".crm-dashboard-record-table")?.getAttribute("lang")||document.documentElement.lang||navigator.language||"en")},[]),(0,i.jsx)("div",{ref:t,role:e?"alert":"status","data-dashboard-empty":"true",style:{padding:"12px 16px",fontSize:"13px",color:"var(--t-font-color-secondary,#697077)"},children:e?n.toLowerCase().startsWith("es")?"No se han podido cargar los registros.":"Unable to load records.":n.toLowerCase().startsWith("es")?"No hay registros que coincidan con esta vista.":"No records match this view."})},u1=()=>{const{recordTableId:e,objectNameSingular:t,objectMetadataItem:n,visibleRecordFields:a}=U()',
      ],
      [
        'l=x(Ln,e),d=H(Hc,e),c=x(CP,e),u=H(_t,e)',
        'l=x(Ln,e),d=H(Hc,e),c=x(CP,e),v=x(DashboardTableError20261012,e),u=H(_t,e)',
      ],
      [
        'p&&!u&&!c?(0,i.jsx)(l1,{tableBodyRef:o}):(0,i.jsx)(JL,{tableBodyRef:o,handleDragSelectionStart:I,handleDragSelectionEnd:C,hasRecordGroups:u,recordTableId:e})',
        'v&&c?(0,i.jsx)(DashboardEmptyState20261012,{error:v}):p&&!u?c?(0,i.jsx)(DashboardEmptyState20261012,{error:null}):(0,i.jsx)(l1,{tableBodyRef:o}):(0,i.jsx)(JL,{tableBodyRef:o,handleDragSelectionStart:I,handleDragSelectionEnd:C,hasRecordGroups:u,recordTableId:e})',
      ],
    ],
  },
  {
    name: 'index-nK5lPcRz.js',
    hash: 'bde69d0685beaab473ea07447279b533cb74b32613908bd620fb9c9008e2337b',
    changes: [
      [
        'return!g(e.objectMetadataId)||!g(a)?null:(0,s.jsx)(iD,{objectMetadataId:e.objectMetadataId,viewId:a,widgetId:e.id,isEmptyStateHidden:!0,recordLimit:r})},Vee=',
        'return!g(e.objectMetadataId)||!g(a)?null:(0,s.jsx)("div",{className:"crm-dashboard-record-table",lang:/^(Hoy|Cola por plazo|Presentadas|Acciones|En espera|Preparación|Justificantes|Expedientes)/i.test(e.title??"")?"es":void 0,children:(0,s.jsx)(iD,{objectMetadataId:e.objectMetadataId,viewId:a,widgetId:e.id,isEmptyStateHidden:!0,recordLimit:r})})},Vee=',
      ],
    ],
  },
  {
    name: 'index-B7YOIt9h.css',
    hash: 'fc23df590df4f9d0d52997f54bf86bb899c6f826dd685d33bfe83511fc3472aa',
    append: '.crm-dashboard-record-table .table-row{min-height:32px;align-items:stretch}.crm-dashboard-record-table [data-dashboard-next-step="true"]{height:auto;min-height:32px;padding-block:4px}.crm-dashboard-record-table [data-dashboard-next-step="true"] .sx4wx53{height:auto;white-space:normal}\n',
  },
];

for (const spec of patches) {
  const path = assetRoot + spec.name;
  const original = fs.readFileSync(path, 'utf8');
  const hash = crypto.createHash('sha256').update(original).digest('hex');
  if (hash !== spec.hash) throw new Error(`Unexpected asset hash for ${spec.name}: ${hash}`);
  let result = original;
  for (const [before, after] of spec.changes || []) {
    if (result.split(before).length !== 2) throw new Error(`Anchor not unique in ${spec.name}: ${before.slice(0, 70)}`);
    result = result.replace(before, after);
  }
  if (spec.append) result += '\n' + spec.append;
  if (spec.name.endsWith('.js')) {
    const syntax = spawnSync(process.execPath, ['--check', '--input-type=module'], { input: result, encoding: 'utf8' });
    if (syntax.status !== 0) throw new Error(`${spec.name}: ${(syntax.stderr.match(/SyntaxError:[^\n]*/)||[])[0] || syntax.stderr.slice(-500)}`);
  }
  fs.writeFileSync(path, result);
  if (fs.readFileSync(path, 'utf8') !== result) throw new Error(`Read-back failed: ${spec.name}`);
  console.log(JSON.stringify({asset: spec.name, before: hash, after: crypto.createHash('sha256').update(result).digest('hex')}));
}
