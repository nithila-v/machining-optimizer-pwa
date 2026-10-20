/* GitHub Pages frontend for the scikit-learn GPR backend.
   After deploying the backend, replace API_BASE_URL below with its HTTPS URL. */
"use strict";
const API_BASE_URL = "https://machining-optimizer-api.onrender.com";
const $ = id => document.getElementById(id);
let materialNames = [];
let latestResults = [];

function apiUrl(path) { return API_BASE_URL.replace(/\/+$/, "") + path; }
function fmt(v, digits=3) {
  if (v === null || v === undefined || !Number.isFinite(Number(v))) return "N/A";
  return Number(v).toLocaleString(undefined, {maximumFractionDigits:digits});
}
function esc(s) {
  return String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
}
function setStatus(message, isError=false) {
  $("statusMsg").textContent = message;
  $("statusMsg").style.color = isError ? "#ffaaa5" : "";
}
function renderMaterials() {
  const select=$("materialSelect"), previous=select.value;
  select.innerHTML=materialNames.length
    ? materialNames.map(m=>`<option value="${esc(m.name)}">${esc(m.name)}</option>`).join("")
    : '<option value="">No material models available</option>';
  if(materialNames.some(m=>m.name===previous)) select.value=previous;
  select.disabled=!materialNames.length;
  $("optimizeBtn").disabled=!materialNames.length;
}
async function loadMaterialList() {
  try {
    setStatus("Connecting to Python GPR backend…");
    const response=await fetch(apiUrl("/api/materials"));
    if(!response.ok) throw new Error("Backend returned " + response.status);
    const data=await response.json();
    materialNames=data.materials || [];
    renderMaterials();
    if(materialNames.length) setStatus("Connected. Material models are ready.");
    else setStatus("No material models are configured on the backend.",true);
  } catch(err) {
    setStatus("Backend not connected. Check the Render service and API_BASE_URL in app.js.", true);
  }
}
$("optimizeBtn").addEventListener("click",async()=>{
  const total=Number($("totalDepth").value), diameter=Number($("workpieceDiameter").value);
  const len=$("cutLength").value.trim(), length=len===""?null:Number(len);
  if(!(total>0)){setStatus("Total depth must be greater than zero.",true);return;}
  if(!(diameter>0)){setStatus("Workpiece diameter must be greater than zero.",true);return;}
  if(length!==null && !(length>0)){setStatus("Cutting length must be greater than zero.",true);return;}
  $("optimizeBtn").disabled=true;setStatus("Running the actual scikit-learn GPR optimizer…");
  try {
    const response=await fetch(apiUrl("/api/optimize"),{
      method:"POST",headers:{"Content-Type":"application/json"},
      body:JSON.stringify({material_name:$("materialSelect").value,total_depth_mm:total,workpiece_diameter_mm:diameter,cut_length_per_pass_mm:length})
    });
    const data=await response.json();
    if(!response.ok) throw new Error(data.detail||"Optimization failed");
    latestResults=data.results;
    renderResults(data);
    setStatus("Optimization complete using the Python GPR model.");
  } catch(err){setStatus(err.message,true);}
  finally{$("optimizeBtn").disabled=!materialNames.length;}
});
function renderResults(data) {
  const rows=data.results, withEnergy=data.energy_calculated;
  $("rankingDescription").textContent=withEnergy
    ?"Ranked by total predicted cutting energy across all passes."
    :"Ranked by average predicted cutting power; energy is N/A because cutting length was not supplied.";
  const first=rows[0];
  $("summaryCards").innerHTML=[
    ["Best candidate DOC",`${fmt(first["DOC option (mm)"])} mm`],
    ["Passes required",String(first["Pass count"])],
    ["Average predicted power",`${fmt(first["Average predicted power (kW)"])} kW`]
  ].map(([label,value])=>`<div class="summary-card"><span>${label}</span><strong>${value}</strong></div>`).join("");
  $("resultsBody").innerHTML=rows.map((r,i)=>`<tr>
    <td>${i+1}</td><td>${fmt(r["DOC option (mm)"])}</td><td>${r["Pass count"]}</td>
    <td>${fmt(r["Final pass DOC (mm)"])}</td><td>${fmt(r["Spindle speed (RPM)"],1)}</td>
    <td>${fmt(r["Feed rate (mm/min)"],2)}</td><td>${fmt(r["Cutting angle (deg)"],2)}</td>
    <td>${fmt(r["Average predicted power (kW)"])}</td>
    <td>${withEnergy?fmt(r["Total predicted energy (kWh)"],6):"N/A"}</td>
    <td>${withEnergy?fmt(r["Predicted CO2 emissions (kg)"],6):"N/A"}</td>
  </tr>`).join("");
  const metrics=data.validation_metrics||{};
  const metricText=Object.entries(metrics).map(([k,v])=>`${k}: ${fmt(v,4)}`).join(" · ");
  $("rankingDescription").textContent += metricText ? ` Validation: ${metricText}.` : "";
  $("resultsSection").classList.remove("hidden");
}
$("exportBtn").addEventListener("click",()=>{
  if(!latestResults.length)return;
  const cols=Object.keys(latestResults[0]);
  const cell=v=>{const s=v===null||v===undefined?"N/A":String(v);return `"${s.replace(/"/g,'""')}"`;};
  const csv=[cols.map(cell).join(","),...latestResults.map(r=>cols.map(k=>cell(r[k])).join(","))].join("\r\n");
  const a=document.createElement("a");a.href=URL.createObjectURL(new Blob([csv],{type:"text/csv"}));a.download="machining-optimizer-results.csv";a.click();URL.revokeObjectURL(a.href);
});
window.addEventListener("beforeinstallprompt",e=>{e.preventDefault();const btn=$("installBtn");btn.classList.remove("hidden");btn.onclick=async()=>{e.prompt();await e.userChoice;btn.classList.add("hidden");};});
if("serviceWorker" in navigator && (location.protocol==="https:" || location.hostname==="localhost")) navigator.serviceWorker.register("./sw.js").catch(()=>{});
loadMaterialList();
