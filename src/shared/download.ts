export function download(blob:Blob,filename:string) {
  const url=URL.createObjectURL(blob);
  const anchor=document.createElement('a');
  anchor.href=url;anchor.download=filename;anchor.click();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
}
export function downloadJSON(value:unknown,filename:string) {
  download(new Blob([JSON.stringify(value,null,2)],{type:'application/json'}),filename);
}
