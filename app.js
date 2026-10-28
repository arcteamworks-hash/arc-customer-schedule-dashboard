(async()=>{
const defaultSchedule = [];

const defaultData = {
  instanceId: "arc-blank-template-v2",
  project: { customer:"", home:"", area:"", start:"", end:"" },
  display: { title:"공정별 고객 방문 및 사전 준비", description:"현장에 꼭 가야 하는 날과 미리 결정할 일을 한 화면에서 확인하세요.", font:"arc", scale:100 },
  copy: {},
  schedule: defaultSchedule,
};
const defaultTypeLabels = { required:"필수 방문", deadline:"발주·준비", general:"일반 공정" };
function typeLabel(type){return copyText(`type.${type}`,defaultTypeLabels[type]||defaultTypeLabels.general);}
function getChecklistGroups(){
  const groups=[
    { key:"check.group.pre", title:copyText("check.group.pre","공사 전"), color:"#c98268", types:[], items:[
      ["pre-report",copyText("check.pre.report.title","관리사무소 공사 신고"),copyText("check.pre.report.detail","공사 시작 전에 신고를 완료하세요."),"check.pre.report.title","check.pre.report.detail"],
      ["pre-elevator",copyText("check.pre.elevator.title","엘리베이터 보양 준비"),copyText("check.pre.elevator.detail","보양 일정과 작업 범위를 확인하세요."),"check.pre.elevator.title","check.pre.elevator.detail"],
      ["pre-consent",copyText("check.pre.consent.title","입주민 동의서 준비·제출"),copyText("check.pre.consent.detail","필요 양식과 제출기한을 관리사무소에 확인하세요."),"check.pre.consent.title","check.pre.consent.detail"],
    ] },
    { key:"check.group.order", title:copyText("check.group.order","발주·준비"), color:"#b49a66", types:["deadline"], items:getOrderDeadlines().map((entry)=>{const titleKey=`check.${entry.id}.title`,detailKey=`check.${entry.id}.detail`,connection=copyText(detailKey,entry.connection); return [entry.id,copyText(titleKey,entry.title),entry.due?`${compactDate(entry.due)}까지 · ${connection}`:`${connection} · 일정 입력 후 자동 계산`,titleKey,detailKey];}) },
    { key:"check.group.required", title:copyText("check.group.required","필수 방문"), color:"#c98268", types:["required"], items:[] },
    { key:"check.group.caulking", title:copyText("check.group.caulking","코킹"), color:"#506a58", types:[], items:[["caulking-color",copyText("check.caulking.title","코킹 시공 방식과 실리콘 색상 확인"),copyText("check.caulking.detail","소개 팀 작업은 색상 선택 불필요 · 별도 시공은 희망 색상 사전 전달 또는 현장 선택"),"check.caulking.title","check.caulking.detail"]] },
  ];
  data.schedule.forEach((item)=>{const group=groups.find((entry)=>entry.types.includes(item.type)); const duplicateFilmOrder=group?.key==="check.group.order"&&matchesAny(item,["필름"]); if(group&&!duplicateFilmOrder)group.items.push([item.id,`${shortDate(item.date)} · ${item.title}`,[item.ruleNote,item.prepare||item.detail].filter(Boolean).join(" · ")||"준비사항을 입력하세요."]);});
  return groups.filter((group)=>group.items.length);
}

const clone = (value) => JSON.parse(JSON.stringify(value));
const bytesToBase64Url=(bytes)=>{
  let binary="";
  for(let offset=0;offset<bytes.length;offset+=0x8000)binary+=String.fromCharCode(...bytes.subarray(offset,offset+0x8000));
  return btoa(binary).replaceAll("+","-").replaceAll("/","_").replace(/=+$/g,"");
};
const base64UrlToBytes=(value)=>{
  const padded=value.replaceAll("-","+").replaceAll("_","/")+"=".repeat((4-value.length%4)%4);
  const binary=atob(padded), bytes=new Uint8Array(binary.length);
  for(let index=0;index<binary.length;index+=1)bytes[index]=binary.charCodeAt(index);
  return bytes;
};
async function compressShareData(value){
  if(!("CompressionStream" in globalThis))return null;
  const stream=new Blob([JSON.stringify(value)]).stream().pipeThrough(new CompressionStream("gzip"));
  return bytesToBase64Url(new Uint8Array(await new Response(stream).arrayBuffer()));
}
async function decompressShareData(value){
  if(!("DecompressionStream" in globalThis))return null;
  const stream=new Blob([base64UrlToBytes(value)]).stream().pipeThrough(new DecompressionStream("gzip"));
  return JSON.parse(await new Response(stream).text());
}
async function decodeShareData(){
  const params=new URLSearchParams(location.hash.slice(1));
  const compressed=params.get("arc-z")||"";
  if(compressed){try{return await decompressShareData(compressed);}catch{return null;}}
  const encoded=params.get("arc-share")||"";
  if(!encoded)return null;
  try{return JSON.parse(encoded);}catch{return null;}
}
const seedNode = document.querySelector("#arc-seed-data");
let seedData;
try { seedData = seedNode?.textContent.trim() ? JSON.parse(seedNode.textContent) : null; } catch { seedData = null; }
const sharedData=await decodeShareData();
const isCustomerView=Boolean(sharedData);
const initial = sharedData || seedData || clone(defaultData);
let dataStorageKey = `arc-process-dashboard-data-${initial.instanceId || "template"}`;
let data;
try { data = isCustomerView ? clone(initial) : JSON.parse(localStorage.getItem(dataStorageKey)) || initial; } catch { data = initial; }
data.project = { ...defaultData.project, ...(data.project || {}) };
data.display = { ...defaultData.display, ...(data.display || {}) };
data.copy = { ...defaultData.copy, ...(data.copy || {}) };
data.schedule = (data.schedule || clone(defaultSchedule)).map((item, index) => ({ ...item, id:item.id || `event-${Date.now()}-${index}` }));
let selectedEventId = data.schedule[0]?.id || null;
let editingEventId = selectedEventId;

const calendarStack = document.querySelector("#calendarStack");
const checklistGrid = document.querySelector("#checklistGrid");
const checklistStorageKey = `${dataStorageKey}-checks`;
const byDate = (a,b) => a.date.localeCompare(b.date);
const isoDate = (value) => new Date(`${value}T00:00:00`);
const formatDate = (value) => new Intl.DateTimeFormat("ko-KR", { year:"numeric", month:"long", day:"numeric" }).format(isoDate(value));
const shortDate = (value) => new Intl.DateTimeFormat("ko-KR", { month:"long", day:"numeric" }).format(isoDate(value));
const makeId = () => globalThis.crypto?.randomUUID?.() || `event-${Date.now()}-${Math.random().toString(16).slice(2)}`;
const normalizedText = (item) => `${item.short || ""}${item.title || ""}`.replace(/\s+/g, "");
const matchesAny = (item, keywords) => keywords.some((keyword) => normalizedText(item).includes(keyword.replace(/\s+/g, "")));
const minusDays = (value, days) => { const date=isoDate(value); date.setDate(date.getDate()-days); return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,"0")}-${String(date.getDate()).padStart(2,"0")}`; };
const compactDate = (value) => value ? value.slice(5).replace("-","/") : "일정 미입력";
function copyText(key,fallback){return Object.hasOwn(data.copy||{},key)?data.copy[key]:fallback;}

const orderRules = [
  { id:"order-tile", keywords:["타일"], title:"타일 제품 주문", connection:"타일 첫 시공일 7일 전" },
  { id:"order-bath", keywords:["욕실세팅","욕실셋팅","욕실설치"], title:"욕실용품 전체 결정 후 주문", connection:"욕실세팅 7일 전" },
  { id:"order-film", keywords:["필름"], title:"필름 넘버를 팀장님께 전달 또는 주문", connection:"필름 첫 시공일 7일 전" },
  { id:"order-furniture", keywords:["가구"], title:"싱크·수전 주문", connection:"가구 첫 시공일 7일 전" },
  { id:"order-door", keywords:["도어설치","도어 설치"], title:"도어 실측 및 마루 두께 전달", connection:"도어설치 약 7일 전" },
];

function firstMatching(keywords){return [...data.schedule].sort(byDate).find((item)=>matchesAny(item,keywords));}
function getOrderDeadlines(){return orderRules.map((rule)=>{const event=firstMatching(rule.keywords); return {...rule,event,due:event?minusDays(event.date,7):""};});}
const processGroups = [
  ["철거",["철거"]],["목공",["목공"]],["전기",["전기"]],["타일",["타일"]],
  ["설비",["설비","배관"]],["욕실",["욕실세팅","욕실셋팅","욕실설치"]],["필름",["필름"]],
  ["마루",["마루"]],["탄성",["탄성코트","탄성"]],["도배",["도배"]],["도어",["도어"]],
  ["가구",["가구","싱크"]],["청소",["입주청소","청소"]],["코킹",["코킹"]],["폐기물",["폐기물"]],
];
function processKeys(item){
  const keys=processGroups.filter(([,keywords])=>matchesAny(item,keywords)).map(([key])=>key);
  return keys.length?keys:[normalizedText(item)||item.id];
}
function applyAutomaticFirstDayDetails(){
  const seen=new Set();
  [...data.schedule].sort(byDate).forEach((item)=>{
    const keys=processKeys(item),isFirst=keys.some((key)=>!seen.has(key));
    if(item.autoDetail===true||item.detail==="공정표 이미지 인식 후 확인한 일정"){
      item.autoDetail=true;
      item.detail=isFirst?"최종 작업 내용 현장팀에게 전달":"";
    }
    keys.forEach((key)=>seen.add(key));
  });
}
function applyScheduleRules(){
  applyAutomaticFirstDayDetails();
  data.schedule.forEach((item)=>{item.manualType=item.manualType||item.type||"general"; if(["optional","marking"].includes(item.manualType))item.manualType="general"; item.type=item.manualType; item.ruleNote="";});
  const firstDayRules=[
    {keywords:["철거"],note:"철거 첫 시공일 · 현장 방문 필수"},
    {keywords:["목공"],note:"목공 첫 시공일 · 현장 방문 필수"},
    {keywords:["전기"],note:"전기 첫 시공일 · 현장 방문 필수"},
    {keywords:["타일"],note:"타일 첫 시공일 · 현장 방문 필수"},
    {keywords:["설비"],note:"설비 첫 시공일 · 현장 방문 필수"},
  ];
  firstDayRules.forEach((rule)=>{const item=firstMatching(rule.keywords); if(item){item.type="required"; item.ruleNote=rule.note;}});
  data.schedule.filter((item)=>matchesAny(item,["전기타공"])).forEach((item)=>{item.type="required"; item.ruleNote="전기타공일 · 현장 방문 필수";});
  const furniture=firstMatching(["가구"]); if(furniture){furniture.type="required"; furniture.ruleNote="가구 첫 시공일 · 오후 현장 방문";}
  const firstFilm=firstMatching(["필름"]); if(firstFilm){firstFilm.type="deadline"; firstFilm.ruleNote="필름 첫 시공일 · 당일 또는 이전까지 위치 전달";}
}

function persistData() { if(isCustomerView)return; try { localStorage.setItem(dataStorageKey, JSON.stringify(data)); } catch {} }

function renderProject() {
  const customer=document.querySelector("#projectCustomer"); customer.textContent=data.project.customer?`${data.project.customer} 고객님`:""; customer.hidden=!data.project.customer;
  const home=document.querySelector("#projectHome"); home.textContent=[data.project.home,data.project.area].filter(Boolean).join(" · "); home.hidden=!home.textContent;
  const period=document.querySelector("#projectPeriod"); period.textContent=data.project.start&&data.project.end?`${data.project.start.replaceAll("-", ".")} — ${data.project.end.replaceAll("-", ".")}`:""; period.hidden=!period.textContent;
}

function renderDisplay(){
  const fontMap={arc:'"Noto Sans KR", "Malgun Gothic", sans-serif',malgun:'"Malgun Gothic", sans-serif',serif:'"Noto Serif KR", "Batang", serif'};
  document.querySelector("#hero-title").textContent=data.display.title||defaultData.display.title;
  document.querySelector(".hero-description").textContent=data.display.description||defaultData.display.description;
  document.documentElement.style.setProperty("--dashboard-font",fontMap[data.display.font]||fontMap.arc);
  document.documentElement.style.setProperty("--font-scale",String((Number(data.display.scale)||100)/100));
}

function renderCopy(){
  document.querySelectorAll("[data-copy-key]").forEach((element)=>{
    const key=element.dataset.copyKey;
    if(Object.hasOwn(data.copy||{},key))element.textContent=data.copy[key];
  });
}

function selectCalendarEvent(item) {
  if (!item) return;
  selectedEventId=item.id;
  document.querySelectorAll(".calendar-day.selected").forEach((day)=>day.classList.remove("selected"));
  document.querySelector(`[data-id="${CSS.escape(item.id)}"]`)?.classList.add("selected");
  document.querySelector("#detailDate").textContent=formatDate(item.date);
  const title=document.querySelector("#detailTitle"); title.textContent=item.title; title.dataset.eventId=item.id; title.dataset.eventField="title";
  const detail=document.querySelector("#detailText"); detail.textContent=item.detail||""; detail.dataset.eventId=item.id; detail.dataset.eventField="detail";
  const prepare=document.querySelector("#detailPrepare"); prepare.textContent=[item.ruleNote,item.prepare].filter(Boolean).join(" · ")||"준비사항을 확인하세요."; prepare.dataset.eventId=item.id; prepare.dataset.eventField="prepare";
  const type=document.querySelector("#detailType"); type.className=`detail-type ${item.type}`; type.textContent=typeLabel(item.type); type.dataset.copyKey=`type.${item.type}`;
}

function renderMonth(year, month) {
  const monthEvents=new Map();
  data.schedule.filter((item)=>{const d=isoDate(item.date); return d.getFullYear()===year&&d.getMonth()===month;}).forEach((item)=>{const day=Number(item.date.slice(-2)); if(!monthEvents.has(day))monthEvents.set(day,[]); monthEvents.get(day).push(item);});
  const firstDay=new Date(year,month,1).getDay(); const lastDate=new Date(year,month+1,0).getDate();
  const panel=document.createElement("section"); panel.className="month-panel";
  panel.innerHTML=`<header><span>${year}</span><h3>${month+1}월</h3></header><div class="weekday-row">${["일","월","화","수","목","금","토"].map((day)=>`<span>${day}</span>`).join("")}</div><div class="calendar-grid"></div>`;
  const grid=panel.querySelector(".calendar-grid"); for(let i=0;i<firstDay;i+=1)grid.insertAdjacentHTML("beforeend",'<span class="calendar-day empty" aria-hidden="true"></span>');
  for(let day=1;day<=lastDate;day+=1){
    const items=monthEvents.get(day)||[];
    if(!items.length){const cell=document.createElement("span"); cell.className="calendar-day"; const b=document.createElement("b"); b.textContent=day; cell.append(b); grid.append(cell); continue;}
    const item=items[0]; const highlighted=items.find((entry)=>entry.type==="required")||items.find((entry)=>entry.type==="deadline")||item; const button=document.createElement("button"); button.type="button"; button.className=`calendar-day has-event ${highlighted.type}`; button.dataset.id=highlighted.id; button.setAttribute("aria-label",`${formatDate(item.date)} ${items.map((entry)=>entry.title).join(", ")}`);
    const b=document.createElement("b"); b.textContent=day; const eventList=document.createElement("span"); eventList.className="calendar-event-list"; items.forEach((entry)=>{const label=document.createElement("em"); label.className=entry.type; label.textContent=entry.short||entry.title; label.dataset.eventId=entry.id; label.dataset.eventField="short"; eventList.append(label);}); button.append(b,eventList); button.addEventListener("click",()=>{if(!document.body.classList.contains("inline-edit-mode"))selectCalendarEvent(highlighted);}); grid.append(button);
  }
  return panel;
}

function monthRange() {
  const dates=[data.project.start,data.project.end,...data.schedule.map((item)=>item.date)].filter(Boolean).sort();
  if(!dates.length)return [];
  let cursor=isoDate(dates[0]); cursor=new Date(cursor.getFullYear(),cursor.getMonth(),1); const finish=isoDate(dates.at(-1)); const months=[];
  while(cursor<=finish&&months.length<24){months.push([cursor.getFullYear(),cursor.getMonth()]); cursor=new Date(cursor.getFullYear(),cursor.getMonth()+1,1);} return months;
}
function renderCalendars(){
  data.schedule.sort(byDate); calendarStack.innerHTML=""; const months=monthRange();
  if(!months.length){calendarStack.innerHTML='<div class="empty-state"><b>등록된 공사 일정이 없습니다.</b><span>상단의 정보 수정에서 공사기간과 달력 일정을 입력하세요.</span></div>';}
  else months.forEach(([year,month])=>calendarStack.append(renderMonth(year,month)));
  const selected=data.schedule.find((item)=>item.id===selectedEventId)||data.schedule[0];
  if(selected)selectCalendarEvent(selected); else {document.querySelector("#detailDate").textContent=""; document.querySelector("#detailType").textContent=""; document.querySelector("#detailTitle").textContent="등록된 일정 없음"; document.querySelector("#detailText").textContent="정보 수정에서 고객별 공정 일정을 추가하세요."; document.querySelector("#detailPrepare").textContent="";}
}

function renderPrintDetails(){
  const list=document.querySelector("#printDetailList"); list.innerHTML="";
  if(!data.schedule.length){const empty=document.createElement("p"); empty.className="print-detail-copy"; empty.textContent="등록된 공정 일정이 없습니다."; list.append(empty); return;}
  [...data.schedule].sort(byDate).forEach((item)=>{
    const article=document.createElement("article"); article.className="print-detail-item";
    const time=document.createElement("time"); time.textContent=new Intl.DateTimeFormat("ko-KR",{month:"long",day:"numeric",weekday:"short"}).format(isoDate(item.date));
    const body=document.createElement("div"), title=document.createElement("div"), badge=document.createElement("span"), strong=document.createElement("strong"), detail=document.createElement("p"), prepare=document.createElement("p"), prepareLabel=document.createElement("b");
    title.className="print-detail-title"; badge.className=`print-detail-type ${item.type}`; badge.textContent=typeLabel(item.type); strong.textContent=item.title; detail.className="print-detail-copy"; detail.textContent=item.detail||""; prepare.className="print-detail-prep"; prepareLabel.textContent="준비"; prepare.append(prepareLabel,document.createTextNode([item.ruleNote,item.prepare].filter(Boolean).join(" · ")||"별도 준비사항 없음")); title.append(badge,strong); body.append(title,detail,prepare); article.append(time,body); list.append(article);
  });
}

function renderMetrics(){
  const required=data.schedule.filter((item)=>item.type==="required"), deadlines=data.schedule.filter((item)=>item.type==="deadline"&&!matchesAny(item,["필름"])), orders=getOrderDeadlines().filter((entry)=>entry.due);
  document.querySelector("#requiredCount").textContent=required.length; document.querySelector("#requiredNames").textContent=required.map((item)=>item.short).join(" · ");
  document.querySelector("#deadlineCount").textContent=orders.length+deadlines.length; document.querySelector("#deadlineNames").textContent=[...orders.map((entry)=>entry.title),...deadlines.map((item)=>item.short||item.title)].join(" · ");
}

function loadChecks(){try{return JSON.parse(localStorage.getItem(checklistStorageKey))||{};}catch{return {};}}
function saveChecks(checks){try{localStorage.setItem(checklistStorageKey,JSON.stringify(checks));}catch{}}
function updateProgress(){const inputs=[...checklistGrid.querySelectorAll('input[type="checkbox"]')]; const done=inputs.filter((input)=>input.checked).length; const progress=inputs.length?Math.round(done/inputs.length*100):0; document.querySelector("#progressRing").style.setProperty("--progress",progress); document.querySelector("#progressPercent").textContent=`${progress}%`; document.querySelector("#progressCount").textContent=`${done} / ${inputs.length} 완료`;}
function renderChecklist(){
  const checks=loadChecks(); checklistGrid.innerHTML=""; const groups=getChecklistGroups();
  if(!groups.length){checklistGrid.innerHTML='<div class="empty-state"><b>체크리스트가 비어 있습니다.</b><span>공정 일정을 추가하면 준비사항이 자동으로 생성됩니다.</span></div>'; updateProgress(); return;}
  groups.forEach((group)=>{const section=document.createElement("section"); section.className="checklist-group"; section.style.setProperty("--group-color",group.color); const heading=document.createElement("h3"); heading.textContent=group.title; if(group.key)heading.dataset.copyKey=group.key; section.append(heading);
    group.items.forEach(([id,label,detail,labelKey,detailKey])=>{const wrapper=document.createElement("label"); wrapper.className="check-item"; wrapper.innerHTML=`<input type="checkbox" data-id="${id}" ${checks[id]?"checked":""} /><span class="check-copy"><strong></strong><small></small></span>`; const strong=wrapper.querySelector("strong"),small=wrapper.querySelector("small"); strong.textContent=label; small.textContent=detail; if(labelKey)strong.dataset.copyKey=labelKey; if(detailKey)small.dataset.copyKey=detailKey; wrapper.querySelector("input").addEventListener("change",(event)=>{const latest=loadChecks(); latest[id]=event.target.checked; saveChecks(latest); updateProgress();}); section.append(wrapper);}); checklistGrid.append(section);}); updateProgress();
}

function updateNextAction(){if(!data.schedule.length){document.querySelector("#nextActionDate").textContent=""; document.querySelector("#nextActionTitle").textContent="등록된 일정 없음"; document.querySelector("#nextActionDetail").textContent="정보 수정에서 첫 공정 일정을 입력하세요."; document.querySelector("#countdown").textContent=""; return;} const today=new Date(); today.setHours(0,0,0,0); const next=data.schedule.find((item)=>isoDate(item.date)>=today)||data.schedule.at(-1); const diff=Math.ceil((isoDate(next.date)-today)/86400000); document.querySelector("#nextActionDate").textContent=shortDate(next.date); document.querySelector("#nextActionTitle").textContent=next.title; document.querySelector("#nextActionDetail").textContent=[next.ruleNote,next.detail].filter(Boolean).join(" · "); document.querySelector("#countdown").textContent=diff>0?`오늘부터 D-${diff}`:diff===0?"오늘 예정된 일정입니다":"전체 예정 일정이 종료되었습니다";}
function renderGuides(){
  const markings=data.schedule.filter((item)=>matchesAny(item,["필름"])).sort(byDate); const filmDateRange=document.querySelector("#filmDateRange"); if(filmDateRange)filmDateRange.textContent=markings.length?`FILM · ${markings.map((item)=>item.date.slice(5).replace("-",".")).join(" — ")}`:"FILM · 일정 확인";
  const table=document.querySelector("#deadlineTable"); if(!table)return; [...table.querySelectorAll(".deadline-row.dynamic")].forEach((row)=>row.remove());
  const addRow=(due,title,connection)=>{const row=document.createElement("div"); row.className="deadline-row dynamic"; row.setAttribute("role","row"); const time=document.createElement("time"); time.textContent=due; const strong=document.createElement("strong"); strong.textContent=title; const span=document.createElement("span"); span.textContent=connection; row.append(time,strong,span); table.append(row);};
  addRow("공사 전","관리사무소 공사 신고 · 엘리베이터 보양 · 입주민 동의서","착공 전에 준비·제출 완료");
  getOrderDeadlines().forEach((entry)=>addRow(compactDate(entry.due),entry.title,entry.connection));
  data.schedule.filter((item)=>item.manualType==="deadline").sort(byDate).forEach((item)=>addRow(compactDate(item.date),item.title,item.prepare||item.detail||"추가 주문·준비 일정"));
}
function renderAll(){applyScheduleRules(); document.body.classList.toggle("customer-view",isCustomerView); renderDisplay(); renderProject(); renderMetrics(); renderCalendars(); renderPrintDetails(); renderGuides(); updateNextAction(); renderChecklist(); renderCopy(); fillEditor();}

const ocrModal=document.querySelector("#ocrModal"), ocrBackdrop=document.querySelector("#ocrBackdrop"), scheduleImageInput=document.querySelector("#scheduleImageInput");
const ocrTable=document.querySelector("#ocrTable"), ocrTableWrap=document.querySelector("#ocrTableWrap"), applyOcrButton=document.querySelector("#applyOcr");
let ocrRows=[];
let ocrImageUrl="";

function openImagePicker(){scheduleImageInput.value=""; scheduleImageInput.click();}
function openOcrModal(){ocrModal.hidden=false; ocrBackdrop.hidden=false; document.body.classList.add("ocr-open");}
function closeOcrModal(){ocrModal.hidden=true; ocrBackdrop.hidden=true; document.body.classList.remove("ocr-open"); if(ocrImageUrl){URL.revokeObjectURL(ocrImageUrl); ocrImageUrl="";}}
function setOcrProgress(progress, label){
  const safe=Math.max(0,Math.min(1,Number(progress)||0));
  document.querySelector("#ocrProgressBar").style.width=`${Math.round(safe*100)}%`;
  document.querySelector("#ocrProgressText").textContent=label;
}
function updateOcrNotice(title,text){document.querySelector("#ocrNoticeTitle").textContent=title; document.querySelector("#ocrNoticeText").textContent=text;}

async function loadTesseract(){
  if(globalThis.Tesseract)return globalThis.Tesseract;
  const sources=[
    "https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js",
    "https://unpkg.com/tesseract.js@5.1.1/dist/tesseract.min.js",
  ];
  for(const src of sources){
    try{
      await new Promise((resolve,reject)=>{const script=document.createElement("script"); script.src=src; script.onload=resolve; script.onerror=reject; document.head.append(script);});
      if(globalThis.Tesseract)return globalThis.Tesseract;
    }catch{}
  }
  throw new Error("인식 도구를 불러오지 못했습니다. 인터넷 연결을 확인해 주세요.");
}

async function prepareOcrCanvas(file){
  const bitmap=await createImageBitmap(file);
  const scale=Math.max(1,Math.min(3,1900/bitmap.width));
  const canvas=document.createElement("canvas");
  canvas.width=Math.round(bitmap.width*scale); canvas.height=Math.round(bitmap.height*scale);
  const context=canvas.getContext("2d",{willReadFrequently:true});
  context.fillStyle="#ffffff"; context.fillRect(0,0,canvas.width,canvas.height);
  context.imageSmoothingEnabled=true; context.imageSmoothingQuality="high"; context.drawImage(bitmap,0,0,canvas.width,canvas.height); bitmap.close?.();
  const pixels=context.getImageData(0,0,canvas.width,canvas.height); const values=pixels.data;
  for(let i=0;i<values.length;i+=4){const grey=values[i]*.299+values[i+1]*.587+values[i+2]*.114; const lifted=Math.max(0,Math.min(255,(grey-128)*1.16+128)); values[i]=values[i+1]=values[i+2]=lifted;}
  context.putImageData(pixels,0,0); return canvas;
}

function parseTsvWords(tsv){
  if(!tsv)return [];
  return tsv.split(/\r?\n/).slice(1).map((line)=>{
    const parts=line.split("\t"); if(parts.length<12||parts[0]!=="5")return null;
    const text=parts.slice(11).join("\t").trim(); if(!text)return null;
    return { block:parts[2], paragraph:parts[3], line:parts[4], word:parts[5], x:Number(parts[6]), y:Number(parts[7]), width:Number(parts[8]), height:Number(parts[9]), confidence:Number(parts[10]), text };
  }).filter((word)=>word&&word.confidence>=5&&Number.isFinite(word.x));
}

function datePartsFromText(value){
  const clean=String(value||"").replace(/[Oo]/g,"0").replace(/[,·]/g,".");
  const match=clean.match(/(?:^|\D)(0?[1-9]|1[0-2])\s*[.\/-]\s*(0?[1-9]|[12]\d|3[01])(?:\D|$)/);
  return match?{month:Number(match[1]),day:Number(match[2])}:null;
}

function canonicalProcessTitle(value){
  const text=String(value||"").replace(/[|_]+/g," ").replace(/\s+/g," ").replace(/^[·.\-–—\s]+|[·.\-–—\s]+$/g,"").trim();
  const tight=text.replace(/\s+/g,"");
  const aliases=[
    [/전기타공/,"전기타공"],[/욕실[세셋]팅/,"욕실세팅"],[/입주청소/,"입주청소"],[/탄성코트/,"탄성코트"],
    [/가스배관철거/,"가스배관 철거"],[/마루철거/,"마루 철거"],[/폐기물/,"폐기물"],[/도어설치/,"도어설치"],
    [/철거/,"철거"],[/목공/,"목공"],[/타일/,"타일"],[/설비/,"설비"],[/필름/,"필름"],[/마루/,"마루"],
    [/도배/,"도배"],[/가구/,"가구"],[/전기/,"전기"],[/코킹/,"코킹"],
  ];
  return aliases.find(([pattern])=>pattern.test(tight))?.[1]||text;
}

function isNoiseText(value){
  const tight=String(value||"").replace(/\s+/g,"");
  return !tight||datePartsFromText(tight)||/^(WEEK|주차|월|화|수|목|금|토|일|MON|TUE|WED|THU|FRI|SAT|SUN)$/i.test(tight)||/^[()\[\]0-9.:/\-]+$/.test(tight);
}

function groupWordsIntoLines(words){
  const lines=[];
  [...words].sort((a,b)=>(a.y+a.height/2)-(b.y+b.height/2)||a.x-b.x).forEach((word)=>{
    const center=word.y+word.height/2; const tolerance=Math.max(8,word.height*.72);
    let line=lines.find((entry)=>Math.abs(entry.center-center)<=tolerance);
    if(!line){line={center,words:[]}; lines.push(line);}
    line.words.push(word); line.center=line.words.reduce((sum,item)=>sum+item.y+item.height/2,0)/line.words.length;
  });
  return lines.sort((a,b)=>a.center-b.center).map((line)=>line.words.sort((a,b)=>a.x-b.x).map((word)=>word.text).join(" "));
}

function mergeProcessLines(lines){
  const joins=new Map([
    ["욕실세팅","욕실세팅"],["욕실셋팅","욕실세팅"],["전기타공","전기타공"],["탄성코트","탄성코트"],
    ["가스배관철거","가스배관 철거"],["마루철거","마루 철거"],["도어설치","도어설치"],["입주청소","입주청소"],
  ]);
  const merged=[];
  for(let index=0;index<lines.length;index+=1){
    const current=String(lines[index]||""); const next=String(lines[index+1]||""); const combined=`${current}${next}`.replace(/\s+/g,"");
    if(next&&joins.has(combined)){merged.push(joins.get(combined)); index+=1;} else merged.push(canonicalProcessTitle(current));
  }
  return merged;
}

function parseScheduleFromTsv(tsv,canvasWidth,canvasHeight,baseYear){
  const words=parseTsvWords(tsv); const candidates=[];
  words.forEach((word,index)=>{
    const combinations=[word.text];
    const next=words[index+1]; if(next&&next.block===word.block&&next.paragraph===word.paragraph&&next.line===word.line)combinations.push(`${word.text}${next.text}`);
    const parts=combinations.map(datePartsFromText).find(Boolean); if(!parts)return;
    const duplicate=candidates.some((item)=>item.month===parts.month&&item.day===parts.day&&Math.abs(item.x-word.x)<12&&Math.abs(item.y-word.y)<12);
    if(!duplicate)candidates.push({...parts,x:word.x,y:word.y,width:word.width,height:word.height,bottom:word.y+word.height});
  });
  if(!candidates.length)return [];
  const averageHeight=candidates.reduce((sum,item)=>sum+item.height,0)/candidates.length||18; const groups=[];
  candidates.sort((a,b)=>(a.y+a.height/2)-(b.y+b.height/2)||a.x-b.x).forEach((candidate)=>{
    const center=candidate.y+candidate.height/2; let group=groups.find((item)=>Math.abs(item.center-center)<=Math.max(16,averageHeight*1.5));
    if(!group){group={center,dates:[]}; groups.push(group);}
    group.dates.push(candidate); group.center=group.dates.reduce((sum,item)=>sum+item.y+item.height/2,0)/group.dates.length;
  });
  groups.sort((a,b)=>a.center-b.center); groups.forEach((group)=>group.dates.sort((a,b)=>a.x-b.x));
  let groupYear=Number(baseYear)||new Date().getFullYear(); let previousAnchorMonth=null; const rows=[];
  groups.forEach((group,groupIndex)=>{
    const nextGroup=groups[groupIndex+1]; const rowBottom=nextGroup?nextGroup.center-averageHeight*1.25:canvasHeight;
    const anchor=group.dates[Math.floor(group.dates.length/2)]; const anchorColumn=Math.max(0,Math.min(6,Math.floor(((anchor.x+anchor.width/2)/canvasWidth)*7)));
    if(previousAnchorMonth!==null&&anchor.month<previousAnchorMonth-6)groupYear+=1; previousAnchorMonth=anchor.month;
    const referenceDate=new Date(groupYear,anchor.month-1,anchor.day);
    const datedColumns=group.dates.map((item)=>({...item,column:Math.max(0,Math.min(6,Math.floor(((item.x+item.width/2)/canvasWidth)*7)))}));
    const baseTimes=datedColumns.map((item)=>{
      const candidateYear=[groupYear-1,groupYear,groupYear+1].sort((a,b)=>Math.abs(new Date(a,item.month-1,item.day)-referenceDate)-Math.abs(new Date(b,item.month-1,item.day)-referenceDate))[0];
      const candidateDate=new Date(candidateYear,item.month-1,item.day); candidateDate.setDate(candidateDate.getDate()-item.column); return candidateDate.getTime();
    }).sort((a,b)=>a-b);
    const rowBaseTime=baseTimes[Math.floor(baseTimes.length/2)];
    for(let column=0;column<7;column+=1){
      const left=canvasWidth*column/7, right=canvasWidth*(column+1)/7;
      const cellDate=new Date(rowBaseTime); cellDate.setDate(cellDate.getDate()+column);
      const cellYear=cellDate.getFullYear(), cellMonth=cellDate.getMonth()+1, cellDay=cellDate.getDate();
      const dateBottom=Math.max(...group.dates.map((item)=>item.bottom));
      const taskWords=words.filter((word)=>{
        const centerX=word.x+word.width/2, centerY=word.y+word.height/2;
        return centerX>=left&&centerX<right&&centerY>dateBottom+Math.max(5,averageHeight*.22)&&centerY<rowBottom&&!datePartsFromText(word.text)&&!/WEEK/i.test(word.text);
      });
      mergeProcessLines(groupWordsIntoLines(taskWords)).filter((title)=>!isNoiseText(title)).forEach((title)=>{
        rows.push({id:makeId(),date:`${cellYear}-${String(cellMonth).padStart(2,"0")}-${String(cellDay).padStart(2,"0")}`,short:title.slice(0,8),title,_month:cellMonth,_day:cellDay,_order:rows.length});
      });
    }
  });
  const seen=new Set(); return rows.filter((row)=>{const key=`${row.date}|${row.title.replace(/\s+/g,"")}`; if(seen.has(key))return false; seen.add(key); return true;});
}

function fallbackRowsFromText(text,baseYear){
  let year=Number(baseYear)||new Date().getFullYear(), previousMonth=null; const rows=[];
  String(text||"").split(/\r?\n/).forEach((line)=>{
    const parts=datePartsFromText(line); if(!parts)return; if(previousMonth!==null&&parts.month<previousMonth-6)year+=1; previousMonth=parts.month;
    const title=canonicalProcessTitle(line.replace(/.*?(0?[1-9]|1[0-2])\s*[.\/-]\s*(0?[1-9]|[12]\d|3[01])[^가-힣A-Za-z]*/,""));
    if(isNoiseText(title))return; rows.push({id:makeId(),date:`${year}-${String(parts.month).padStart(2,"0")}-${String(parts.day).padStart(2,"0")}`,short:title.slice(0,8),title,_month:parts.month,_day:parts.day,_order:rows.length});
  });
  return rows;
}

function renderOcrRows(){
  ocrTable.innerHTML="";
  if(!ocrRows.length){ocrTable.innerHTML='<div class="ocr-empty">인식된 일정이 없습니다. ‘일정 추가’로 직접 입력할 수 있습니다.</div>'; applyOcrButton.disabled=true; return;}
  ocrRows.forEach((row)=>{
    const wrapper=document.createElement("div"); wrapper.className="ocr-row"; wrapper.dataset.id=row.id;
    wrapper.innerHTML='<label>날짜<input class="ocr-row-date" type="date" /></label><label>달력 표시<input class="ocr-row-short" type="text" maxlength="8" /></label><label>공정명<input class="ocr-row-title" type="text" /></label><button class="ocr-row-remove" type="button" aria-label="이 일정 삭제">×</button>';
    wrapper.querySelector(".ocr-row-date").value=row.date; wrapper.querySelector(".ocr-row-short").value=row.short; wrapper.querySelector(".ocr-row-title").value=row.title;
    wrapper.querySelector(".ocr-row-date").addEventListener("input",(event)=>{row.date=event.target.value; delete row._month; delete row._day;});
    wrapper.querySelector(".ocr-row-short").addEventListener("input",(event)=>{row.short=event.target.value;});
    wrapper.querySelector(".ocr-row-title").addEventListener("input",(event)=>{const previous=row.title; row.title=event.target.value; if(!row.short||row.short===previous.slice(0,8)){row.short=event.target.value.slice(0,8); wrapper.querySelector(".ocr-row-short").value=row.short;}});
    wrapper.querySelector(".ocr-row-remove").addEventListener("click",()=>{ocrRows=ocrRows.filter((item)=>item.id!==row.id); renderOcrRows(); updateOcrNotice(`${ocrRows.length}개 일정을 확인해 주세요.`,`날짜와 공정명을 수정한 뒤 확인 버튼을 눌러 주세요.`);});
    ocrTable.append(wrapper);
  });
  applyOcrButton.disabled=false;
}

function recalculateOcrYears(){
  let year=Number(document.querySelector("#ocrBaseYear").value)||new Date().getFullYear(), previousMonth=null;
  ocrRows.filter((row)=>row._month).sort((a,b)=>a._order-b._order).forEach((row)=>{if(previousMonth!==null&&row._month<previousMonth-6)year+=1; previousMonth=row._month; row.date=`${year}-${String(row._month).padStart(2,"0")}-${String(row._day).padStart(2,"0")}`;}); renderOcrRows();
}

async function recognizeScheduleImage(file){
  openOcrModal(); ocrRows=[]; renderOcrRows(); ocrTableWrap.hidden=true; applyOcrButton.disabled=true;
  if(ocrImageUrl)URL.revokeObjectURL(ocrImageUrl); ocrImageUrl=URL.createObjectURL(file); document.querySelector("#ocrPreviewImage").src=ocrImageUrl;
  const defaultYear=(data.project.start||"").slice(0,4)||String(new Date().getFullYear()); document.querySelector("#ocrBaseYear").value=defaultYear;
  updateOcrNotice("이미지에서 일정을 읽고 있습니다.","첫 실행은 한글 인식 준비 때문에 조금 더 걸릴 수 있습니다."); setOcrProgress(.03,"인식 도구 준비 중");
  let worker;
  try{
    const Tesseract=await loadTesseract(); const canvas=await prepareOcrCanvas(file);
    const statusLabels={"loading tesseract core":"인식 엔진 불러오는 중","initializing tesseract":"인식 엔진 초기화 중","loading language traineddata":"한글 학습자료 불러오는 중","initializing api":"한글 인식 준비 중","recognizing text":"날짜와 공정 읽는 중"};
    worker=await Tesseract.createWorker("kor+eng",1,{logger:(message)=>{const base=message.status==="recognizing text" ? .36 : .05; const span=message.status==="recognizing text" ? .62 : .3; setOcrProgress(base+(message.progress||0)*span,statusLabels[message.status]||"공정표 분석 중");}});
    await worker.setParameters({preserve_interword_spaces:"1"});
    const result=await worker.recognize(canvas,{}, {text:true,tsv:true}); setOcrProgress(.99,"인식 결과 정리 중");
    ocrRows=parseScheduleFromTsv(result.data.tsv,canvas.width,canvas.height,defaultYear);
    if(!ocrRows.length)ocrRows=fallbackRowsFromText(result.data.text,defaultYear);
    ocrTableWrap.hidden=false; renderOcrRows(); setOcrProgress(1,"인식 완료");
    updateOcrNotice(`${ocrRows.length}개 일정을 찾았습니다. 일정이 맞는지 확인해 주세요.`,`날짜·달력 표시·공정명을 바로 수정하거나 빠진 일정을 추가한 뒤 ‘확인 후 일정 반영’을 눌러 주세요.`);
  }catch(error){
    ocrTableWrap.hidden=false; renderOcrRows(); setOcrProgress(0,"인식을 완료하지 못했습니다"); updateOcrNotice("이미지를 자동 인식하지 못했습니다.",error?.message||"인터넷 연결을 확인하거나 다른 이미지로 다시 시도해 주세요. 직접 일정 추가도 가능합니다.");
  }finally{await worker?.terminate?.();}
}

function applyRecognizedSchedule(){
  const validRows=ocrRows.map((row)=>({...row,date:String(row.date||""),title:String(row.title||"").trim(),short:String(row.short||"").trim()})).filter((row)=>/^\d{4}-\d{2}-\d{2}$/.test(row.date)&&row.title);
  if(!validRows.length){updateOcrNotice("반영할 일정을 확인해 주세요.","날짜와 공정명이 입력된 일정이 한 개 이상 필요합니다."); return;}
  const recognized=validRows.map((row)=>({id:makeId(),date:row.date,short:(row.short||row.title).slice(0,8),title:row.title,type:"general",manualType:"general",detail:"",prepare:"",autoDetail:true}));
  const mode=document.querySelector('input[name="ocrApplyMode"]:checked')?.value||"replace";
  if(mode==="replace")data.schedule=recognized;
  else {const keys=new Set(data.schedule.map((item)=>`${item.date}|${normalizedText(item)}`)); recognized.forEach((item)=>{const key=`${item.date}|${normalizedText(item)}`; if(!keys.has(key)){data.schedule.push(item); keys.add(key);}});}
  data.schedule.sort(byDate); const dates=data.schedule.map((item)=>item.date).filter(Boolean).sort();
  if(dates.length){data.project.start=dates[0]; data.project.end=dates.at(-1);}
  selectedEventId=data.schedule[0]?.id||null; editingEventId=selectedEventId; persistData(); renderAll(); closeOcrModal(); closeEditor(); document.querySelector("#schedule")?.scrollIntoView({behavior:"smooth",block:"start"});
}

const editorPanel=document.querySelector("#editorPanel"), backdrop=document.querySelector("#editorBackdrop");
function openEditor(){editorPanel.hidden=false; backdrop.hidden=false; document.body.classList.add("editor-open"); fillEditor();}
function closeEditor(){editorPanel.hidden=true; backdrop.hidden=true; document.body.classList.remove("editor-open");}
function fillEditor(){
  document.querySelector("#editCustomer").value=data.project.customer||""; document.querySelector("#editHome").value=data.project.home||""; document.querySelector("#editArea").value=data.project.area||""; document.querySelector("#editStart").value=data.project.start||""; document.querySelector("#editEnd").value=data.project.end||"";
  document.querySelector("#editHeroTitle").value=data.display.title||""; document.querySelector("#editHeroDescription").value=data.display.description||""; document.querySelector("#editFontFamily").value=data.display.font||"arc"; document.querySelector("#editFontScale").value=String(data.display.scale||100); document.querySelector("#fontSizeValue").textContent=`${data.display.scale||100}%`;
  const select=document.querySelector("#eventSelect"); select.innerHTML=""; data.schedule.forEach((item)=>{const option=document.createElement("option"); option.value=item.id; option.textContent=`${item.date} · ${item.title}`; select.append(option);}); editingEventId=data.schedule.some((item)=>item.id===editingEventId)?editingEventId:(selectedEventId||data.schedule[0]?.id||null); if(editingEventId){select.value=editingEventId; loadEventFields(data.schedule.find((item)=>item.id===editingEventId));} else loadEventFields(null);
}
function loadEventFields(item){document.querySelector("#editEventDate").value=item?.date||data.project.start||""; document.querySelector("#editEventShort").value=item?.short||""; document.querySelector("#editEventTitle").value=item?.title||""; document.querySelector("#editEventType").value=item?.manualType||item?.type||"general"; document.querySelector("#editEventDetail").value=item?.detail||""; document.querySelector("#editEventPrepare").value=item?.prepare||""; document.querySelector("#deleteEvent").disabled=!item;}

document.querySelector("#dashboardEditor").addEventListener("submit",(event)=>{
  event.preventDefault(); data.project={customer:document.querySelector("#editCustomer").value.trim(),home:document.querySelector("#editHome").value.trim(),area:document.querySelector("#editArea").value.trim(),start:document.querySelector("#editStart").value,end:document.querySelector("#editEnd").value};
  data.display={title:document.querySelector("#editHeroTitle").value.trim()||defaultData.display.title,description:document.querySelector("#editHeroDescription").value.trim()||defaultData.display.description,font:document.querySelector("#editFontFamily").value,scale:Number(document.querySelector("#editFontScale").value)||100};
  const selectedType=document.querySelector("#editEventType").value; const item={id:editingEventId||makeId(),date:document.querySelector("#editEventDate").value,short:document.querySelector("#editEventShort").value.trim(),title:document.querySelector("#editEventTitle").value.trim(),type:selectedType,manualType:selectedType,detail:document.querySelector("#editEventDetail").value.trim(),prepare:document.querySelector("#editEventPrepare").value.trim(),autoDetail:false};
  if(item.date&&item.short&&item.title){const index=data.schedule.findIndex((entry)=>entry.id===item.id); if(index>=0)data.schedule[index]=item; else data.schedule.push(item); editingEventId=item.id; selectedEventId=item.id;}
  persistData(); renderAll(); closeEditor();
});
document.querySelector("#eventSelect").addEventListener("change",(event)=>{editingEventId=event.target.value; loadEventFields(data.schedule.find((item)=>item.id===editingEventId));});
document.querySelector("#editFontScale").addEventListener("input",(event)=>{document.querySelector("#fontSizeValue").textContent=`${event.target.value}%`;});
document.querySelector("#printFromEditor").addEventListener("click",()=>{const form=document.querySelector("#dashboardEditor"); if(!form.reportValidity())return; form.requestSubmit(); setTimeout(()=>window.print(),180);});
document.querySelector("#newEvent").addEventListener("click",()=>{editingEventId=null; document.querySelector("#eventSelect").value=""; loadEventFields(null); document.querySelector("#editEventTitle").focus();});
document.querySelector("#deleteEvent").addEventListener("click",()=>{if(!editingEventId||!confirm("선택한 일정을 삭제할까요?"))return; data.schedule=data.schedule.filter((item)=>item.id!==editingEventId); editingEventId=data.schedule[0]?.id||null; selectedEventId=editingEventId; persistData(); renderAll();});
document.querySelector("#downloadCustomer").addEventListener("click",()=>{
  const form=document.querySelector("#dashboardEditor"); if(!form.reportValidity())return; form.requestSubmit();
  const exportData=clone(data); exportData.instanceId=makeId(); const previous=seedNode.textContent; seedNode.textContent=JSON.stringify(exportData).replaceAll("<","\\u003c"); const source=`<!doctype html>\n${document.documentElement.outerHTML}`; seedNode.textContent=previous;
  const blob=new Blob([source],{type:"text/html;charset=utf-8"}); const link=document.createElement("a"); link.href=URL.createObjectURL(blob); const name=[data.project.customer,data.project.home,"공정대시보드"].filter(Boolean).join("_").replace(/[\\/:*?\"<>|]/g,"-"); link.download=`${name||"ARC_고객_공정대시보드"}.html`; link.click(); URL.revokeObjectURL(link.href);
});

const shareModal=document.querySelector("#shareModal"), shareBackdrop=document.querySelector("#shareBackdrop"), shareHistoryKey="arc-process-dashboard-share-links-v1";
const shareAppVersion="20261028-9";
async function encodeShareData(value){
  const compressed=await compressShareData(value);
  return compressed?{key:"arc-z",value:compressed}:{key:"arc-share",value:encodeURIComponent(JSON.stringify(value))};
}
function loadShareHistory(){try{return JSON.parse(localStorage.getItem(shareHistoryKey))||[];}catch{return [];}}
function saveShareHistory(items){try{localStorage.setItem(shareHistoryKey,JSON.stringify(items.slice(0,12)));}catch{}}
async function copyTextToClipboard(value,button){
  try{await navigator.clipboard.writeText(value);}catch{const field=document.querySelector("#shareUrl"); field.value=value; field.focus(); field.select(); document.execCommand("copy");}
  if(button){const previous=button.textContent; button.textContent="복사 완료"; setTimeout(()=>{button.textContent=previous;},1400);}
}
function renderShareHistory(){
  const list=document.querySelector("#shareHistoryList"), items=loadShareHistory(); list.innerHTML="";
  if(!items.length){const empty=document.createElement("p"); empty.className="share-history-empty"; empty.textContent="아직 만든 고객 링크가 없습니다."; list.append(empty); return;}
  items.forEach((entry)=>{const row=document.createElement("article"); row.className="share-history-item"; const info=document.createElement("div"), name=document.createElement("strong"), time=document.createElement("time"), actions=document.createElement("div"), copy=document.createElement("button"), remove=document.createElement("button"); name.textContent=entry.name; time.textContent=new Intl.DateTimeFormat("ko-KR",{dateStyle:"medium",timeStyle:"short"}).format(new Date(entry.createdAt)); copy.type="button"; copy.textContent="복사"; remove.type="button"; remove.className="share-delete"; remove.textContent="삭제"; copy.addEventListener("click",()=>copyTextToClipboard(entry.url,copy)); remove.addEventListener("click",()=>{saveShareHistory(loadShareHistory().filter((item)=>item.id!==entry.id)); renderShareHistory();}); info.append(name,time); actions.append(copy,remove); row.append(info,actions); list.append(row);});
}
function openShareModal(){
  closeEditor(); document.querySelector("#shareName").value=[data.project.customer,data.project.home].filter(Boolean).join(" · ")||"고객 공정 대시보드"; document.querySelector("#shareUrl").value=""; document.querySelector("#copyShareLink").disabled=true; const notice=document.querySelector("#shareModeNotice"); notice.textContent=location.protocol==="file:"?"현재 파일에서 만든 주소는 이 컴퓨터에서만 열립니다. 실제 고객 전달용 링크는 온라인 대시보드에서 만들어 주세요.":"카카오톡 대화창에 링크만 단독으로 붙여넣고 잠시 기다리면 ARC 제목·설명 카드가 표시됩니다."; renderShareHistory(); shareModal.hidden=false; shareBackdrop.hidden=false; document.body.classList.add("share-open");
}
function closeShareModal(){shareModal.hidden=true; shareBackdrop.hidden=true; document.body.classList.remove("share-open");}
async function buildCompressedShareUrl(){
  const exportData=clone(data); exportData.instanceId=makeId(); const encoded=await encodeShareData(exportData); const base=new URL(location.href); base.hash=""; base.search=""; base.searchParams.set("v",shareAppVersion); base.hash=`${encoded.key}=${encoded.value}`; return base.href;
}
function shortenUrlWithIsGd(url){
  return new Promise((resolve,reject)=>{
    const callback=`arcShort_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const script=document.createElement("script");
    const timer=setTimeout(()=>finish(new Error("단축주소 응답 시간이 초과되었습니다.")),15000);
    const finish=(error,value)=>{clearTimeout(timer); script.remove(); try{delete window[callback];}catch{} if(error)reject(error); else resolve(value);};
    window[callback]=(result)=>result?.shorturl?finish(null,result.shorturl):finish(new Error(result?.errormessage||"단축주소를 만들지 못했습니다."));
    script.onerror=()=>finish(new Error("단축주소 서비스에 연결하지 못했습니다."));
    const endpoint=new URL("https://is.gd/create.php"); endpoint.searchParams.set("format","json"); endpoint.searchParams.set("callback",callback); endpoint.searchParams.set("url",url); script.src=endpoint.href; document.head.append(script);
  });
}
function saveCreatedShareLink(url,name){
  document.querySelector("#shareUrl").value=url; document.querySelector("#copyShareLink").disabled=false; const history=loadShareHistory(); history.unshift({id:makeId(),name,url,createdAt:new Date().toISOString()}); saveShareHistory(history); renderShareHistory();
}
async function makeShareLink(useShortener=true){
  const shortButton=document.querySelector("#makeShareLink"), privateButton=document.querySelector("#makePrivateShareLink"), button=useShortener?shortButton:privateButton, previous=button.textContent;
  shortButton.disabled=true; privateButton.disabled=true; button.textContent=useShortener?"단축주소 만드는 중…":"링크 만드는 중…";
  try{
    const longUrl=await buildCompressedShareUrl(); const name=document.querySelector("#shareName").value.trim()||"고객 공정 대시보드"; const url=useShortener?await shortenUrlWithIsGd(longUrl):longUrl; saveCreatedShareLink(url,name); const notice=document.querySelector("#shareModeNotice"); notice.textContent=useShortener?"짧은 고객 링크가 만들어졌습니다. 복사해서 카카오톡에 링크만 단독으로 붙여넣으세요.":"외부 서비스에 전송하지 않은 압축 링크입니다. 일정이 많으면 주소가 길게 표시될 수 있습니다.";
  }catch(error){const notice=document.querySelector("#shareModeNotice"); notice.textContent=`짧은 링크 생성 실패 · ${error.message} 잠시 후 다시 시도하거나 ‘외부 전송 없이 만들기’를 이용하세요.`;
  }finally{shortButton.disabled=false; privateButton.disabled=false; button.textContent=previous;}
}

const inlineEditToolbar=document.querySelector("#inlineEditToolbar");
let inlineEditSnapshot=null;
function editableCopyNodes(){
  return [...document.querySelectorAll('main [data-copy-key], footer [data-copy-key], main [data-display-field], main [data-event-id][data-event-field]')];
}
function endInlineEdit(){
  editableCopyNodes().forEach((element)=>{element.removeAttribute("contenteditable"); element.removeAttribute("spellcheck"); delete element.dataset.editOriginal;});
  document.body.classList.remove("inline-edit-mode"); inlineEditToolbar.hidden=true; inlineEditSnapshot=null;
}
function startInlineEdit(){
  closeEditor(); closeOcrModal(); inlineEditSnapshot=clone(data); document.body.classList.add("inline-edit-mode"); inlineEditToolbar.hidden=false;
  editableCopyNodes().forEach((element)=>{element.setAttribute("contenteditable","true"); element.setAttribute("spellcheck","false"); element.dataset.editOriginal=element.textContent.trim();});
  document.querySelector('[contenteditable="true"]')?.focus();
}
function saveInlineEdit(){
  editableCopyNodes().forEach((element)=>{
    let value=element.innerText.trim();
    if(value===element.dataset.editOriginal)return;
    const copyKey=element.dataset.copyKey, displayField=element.dataset.displayField, eventId=element.dataset.eventId, eventField=element.dataset.eventField;
    if(copyKey){
      if(copyKey.startsWith("check.order-")&&copyKey.endsWith(".detail"))value=value.replace(/^\d{2}\/\d{2}까지\s*·\s*/,"").replace(/\s*·\s*일정 입력 후 자동 계산$/,"");
      data.copy[copyKey]=value;
    }
    if(displayField)data.display[displayField]=value;
    if(eventId&&eventField){
      const item=data.schedule.find((entry)=>entry.id===eventId);
      if(!item)return;
      if(eventField==="prepare"){
        if(item.ruleNote&&value.startsWith(item.ruleNote))value=value.slice(item.ruleNote.length).replace(/^\s*·\s*/,"");
        item.prepare=value==="준비사항을 확인하세요."?"":value;
      }else if(eventField==="detail"){item.detail=value; item.autoDetail=false;}
      else item[eventField]=value;
    }
  });
  endInlineEdit(); persistData(); renderAll();
}
function cancelInlineEdit(){
  editableCopyNodes().forEach((element)=>{if(element.dataset.editOriginal!==undefined)element.textContent=element.dataset.editOriginal;});
  if(inlineEditSnapshot)data=clone(inlineEditSnapshot);
  endInlineEdit(); renderAll();
}

function resetDashboard(){
  if(isCustomerView||!confirm("공정표, 고객 정보, 수정한 글자, 체크 상태를 모두 지우고 처음부터 다시 시작할까요?\n\n이 작업은 되돌릴 수 없습니다."))return;
  data=clone(defaultData); data.instanceId=initial.instanceId||defaultData.instanceId; selectedEventId=null; editingEventId=null;
  try{localStorage.removeItem(checklistStorageKey); localStorage.setItem(dataStorageKey,JSON.stringify(data));}catch{}
  endInlineEdit(); closeEditor(); closeOcrModal(); closeShareModal(); renderAll(); window.scrollTo({top:0,behavior:"smooth"});
}

document.querySelector("#scanButton").addEventListener("click",openImagePicker); document.querySelector("#scanEditorButton").addEventListener("click",openImagePicker); document.querySelector("#ocrReselect").addEventListener("click",openImagePicker);
scheduleImageInput.addEventListener("change",(event)=>{const file=event.target.files?.[0]; if(file)recognizeScheduleImage(file);});
document.querySelector("#closeOcr").addEventListener("click",closeOcrModal); document.querySelector("#cancelOcr").addEventListener("click",closeOcrModal); ocrBackdrop.addEventListener("click",closeOcrModal);
document.querySelector("#addOcrRow").addEventListener("click",()=>{ocrRows.push({id:makeId(),date:data.project.start||`${document.querySelector("#ocrBaseYear").value||new Date().getFullYear()}-01-01`,short:"",title:"",_order:ocrRows.length}); renderOcrRows();});
document.querySelector("#ocrBaseYear").addEventListener("change",recalculateOcrYears); applyOcrButton.addEventListener("click",applyRecognizedSchedule);
document.querySelector("#editButton").addEventListener("click",openEditor); document.querySelector("#closeEditor").addEventListener("click",closeEditor); backdrop.addEventListener("click",closeEditor);
document.querySelector("#inlineEditButton").addEventListener("click",startInlineEdit); document.querySelector("#saveInlineEdit").addEventListener("click",saveInlineEdit); document.querySelector("#cancelInlineEdit").addEventListener("click",cancelInlineEdit);
document.querySelector("#shareButton").addEventListener("click",openShareModal); document.querySelector("#closeShare").addEventListener("click",closeShareModal); shareBackdrop.addEventListener("click",closeShareModal); document.querySelector("#makeShareLink").addEventListener("click",()=>makeShareLink(true)); document.querySelector("#makePrivateShareLink").addEventListener("click",()=>makeShareLink(false)); document.querySelector("#copyShareLink").addEventListener("click",(event)=>copyTextToClipboard(document.querySelector("#shareUrl").value,event.currentTarget));
document.querySelector("#resetDashboard").addEventListener("click",resetDashboard); document.querySelector("#resetChecklist").addEventListener("click",()=>{try{localStorage.removeItem(checklistStorageKey);}catch{} renderChecklist();}); document.querySelector("#printButton").addEventListener("click",()=>window.print());
renderAll();
})();
