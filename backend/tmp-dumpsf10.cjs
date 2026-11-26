const ExcelJS = require("exceljs");
async function dump(p){
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(p);
  const out = {};
  wb.eachSheet((ws)=>{
    ws.eachRow({includeEmpty:false},(row,r)=>{
      row.eachCell({includeEmpty:false},(cell,c)=>{
        let t; try{t=cell.text;}catch(e){return;}
        if(t) out[ws.name+"!"+cell.address]=t;
      });
    });
  });
  return out;
}
(async()=>{
  const a = await dump(process.argv[2]);
  const b = await dump(process.argv[3]);
  let n=0;
  for(const k of new Set([...Object.keys(a),...Object.keys(b)])){
    if(a[k]!==b[k]){ console.log(k, JSON.stringify(a[k]), "|", JSON.stringify(b[k])); if(++n>80) return; }
  }
  console.log("diffs:",n);
})();
