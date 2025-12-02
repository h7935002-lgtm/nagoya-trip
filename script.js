/* --- Firebase 設定 --- */
const firebaseConfig = {
    // 請確保這些金鑰與您原本的一致
    apiKey: "AIzaSyDTQeG0emT5pqRYwCebkyVyGttmy-t6crY",
    authDomain: "travel-d67d0.firebaseapp.com",
    projectId: "travel-d67d0",
    storageBucket: "travel-d67d0.firebasestorage.app",
    messagingSenderId: "223292356224",
    appId: "1:223292356224:web:5511095a095ffc4080d865"
};

/* --- 初始化 Firebase --- */
if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();
// 這是您永久的資料庫 ID，確保資料不會跑掉
const tripDocRef = db.collection("trips").doc("nagoya_2025_trip_permanent"); 

/* --- 預設資料結構 (當雲端沒資料時使用) --- */
const defaultData = {
    meta: { title: "🇯🇵 名古屋・白川鄉", subtitle: "DEC 05 - DEC 09, 2025", startDate: "2025-12-05", endDate: "2025-12-09", rate: 0.22 },
    notesList: [], expenses: [],
    itinerary: { d1: [{ id: 101, time: "11:00", type: "✈️ 飛行", title: "抵達桃園機場", loc: "機場", note: "", memo: "" }] },
    checklist_pre: [{ category: "必備證件", items: [{ text: "護照", checked: false }] }],
    checklist_tour: [{ category: "必買", items: [{ text: "藥妝", checked: false }] }],
    activityTypes: ["✈️ 飛行", "🚄 交通", "🎡 景點", "🍴 用餐", "🏨 住宿", "🛍️ 購物"]
};

let currentDay = 'd1';
let currentChecklistType = 'pre';
let isEditing = false;
let appData = JSON.parse(JSON.stringify(defaultData));
let sortableInstance = null;
let currentEditingNoteId = null;
let saveTimeout;

// 當網頁載入完成後執行
window.onload = function() { initRealtimeSync(); };

/* --- 初始化與即時同步 --- */
function initRealtimeSync() {
    showStatus("連線中...");
    tripDocRef.onSnapshot((doc) => {
        if (doc.exists) {
            const remoteData = doc.data();
            // 只有在「非編輯模式」或「第一次載入」時才更新畫面，避免打字被中斷
            if (!isEditing || !appData.itinerary) {
                appData = remoteData;
                // 資料完整性檢查 (防止舊資料缺欄位)
                if(!appData.notesList) appData.notesList = [];
                if(!appData.expenses) appData.expenses = [];
                if(!appData.meta) appData.meta = defaultData.meta;
                if(!appData.activityTypes) appData.activityTypes = defaultData.activityTypes;
                
                // 更新標題與副標題
                document.querySelector('.trip-title').innerText = appData.meta.title + ' (V30.1)';
                document.querySelector('.trip-subtitle').innerText = appData.meta.subtitle;
                if(document.getElementById('current-rate')) document.getElementById('current-rate').innerText = appData.meta.rate || 0.22;
                
                // 重新繪製所有畫面
                renderTabs(); renderSchedule(); renderChecklist(); renderExpenses(); renderNotesGrid();
            }
            showStatus("已同步", false);
            setTimeout(() => hideStatus(), 2000);
        } else { 
            saveDataToCloud(true); // 如果雲端是空的，上傳預設值
        }
    }, (error) => { console.error(error); showStatus("同步失敗"); });
}

/* --- 自動存檔功能 --- */
function triggerSave() {
    showStatus("儲存中...");
    clearTimeout(saveTimeout);
    // 延遲 1 秒後存檔，避免太頻繁寫入
    saveTimeout = setTimeout(() => { saveDataToCloud(true); }, 1000);
}

function saveDataToCloud(force = false) {
    showStatus("儲存中...");
    tripDocRef.set(appData)
        .then(() => { showStatus("已儲存"); setTimeout(() => hideStatus(), 2000); })
        .catch((e) => showStatus("儲存失敗"));
}

/* --- ⚙️ 設定與備份功能 --- */
function openSettings() { document.getElementById('settings-modal').classList.add('show'); }
function closeSettings() { document.getElementById('settings-modal').classList.remove('show'); }

function downloadData() {
    const dataStr = JSON.stringify(appData, null, 2);
    const blob = new Blob([dataStr], {type: "application/json"});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `trip_backup_${new Date().toISOString().slice(0,10)}.json`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
}

function uploadData(input) {
    const file = input.files[0];
    if(!file) return;
    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            const importedData = JSON.parse(e.target.result);
            if(confirm("確定要還原此備份嗎？目前畫面將被覆蓋。")) {
                appData = importedData;
                // 補全可能缺失的欄位
                if(!appData.meta) appData.meta = defaultData.meta;
                if(!appData.notesList) appData.notesList = [];
                document.querySelector('.trip-title').innerText = appData.meta.title;
                document.querySelector('.trip-subtitle').innerText = appData.meta.subtitle;
                if(document.getElementById('current-rate')) document.getElementById('current-rate').innerText = appData.meta.rate || 0.22;
                
                renderTabs(); renderSchedule(); renderChecklist(); renderExpenses(); renderNotesGrid();
                saveDataToCloud(true); 
                alert("還原成功！"); closeSettings(); 
            }
        } catch(err) { alert("檔案格式錯誤"); console.error(err); }
    };
    reader.readAsText(file); input.value = '';
}

/* --- 📝 筆記功能 (分頁模式) --- */
function renderNotesGrid() {
    const container = document.getElementById('notes-grid-container'); container.innerHTML = '';
    if(!appData.notesList || appData.notesList.length === 0) { container.innerHTML = '<div style="grid-column:1/-1;text-align:center;color:#999;padding:20px;">尚無筆記</div>'; return; }
    appData.notesList.forEach(note => {
        const div = document.createElement('div'); div.className = 'note-card';
        div.onclick = function(e) { if(e.target.closest('.note-del-btn')) return; openNoteEditor(note.id); };
        
        // 強制寫入 style 確保按鈕顯示
        const delBtnStyle = isEditing ? 'display:flex !important;' : 'display:none;';
        div.innerHTML = `<div class="note-del-btn" style="${delBtnStyle}" onclick="deleteNote(${note.id})">×</div><div class="note-preview">${note.content || "(空白)"}</div><div class="note-date">${note.date || ""}</div>`;
        container.appendChild(div);
    });
}
function createNewNote() { const id = Date.now(); appData.notesList.push({id: id, content: "", date: new Date().toLocaleDateString()}); triggerSave(); renderNotesGrid(); openNoteEditor(id); }
function openNoteEditor(id) { 
    currentEditingNoteId = id; 
    const n = appData.notesList.find(x => x.id === id); 
    if(n) { 
        document.getElementById('current-note-input').value = n.content; 
        document.getElementById('notes-list-view').style.display = 'none';
        document.getElementById('notes-editor-view').style.display = 'flex';
    } 
}
function saveAndCloseNoteEditor() {
    if(currentEditingNoteId) {
        const idx = appData.notesList.findIndex(x => x.id === currentEditingNoteId);
        if(idx > -1) { appData.notesList[idx].content = document.getElementById('current-note-input').value; triggerSave(); }
    }
    closeNoteEditor();
}
function closeNoteEditor() { 
    document.getElementById('notes-editor-view').style.display = 'none';
    document.getElementById('notes-list-view').style.display = 'block';
    renderNotesGrid();
}
function deleteNote(id) { if(confirm("刪除？")) { appData.notesList = appData.notesList.filter(x => x.id !== id); triggerSave(); renderNotesGrid(); } }

/* --- 頁面切換邏輯 --- */
function switchView(view) {
    document.querySelectorAll('.view-btn').forEach(b => b.classList.remove('active'));
    document.getElementById('btn-view-' + view).classList.add('active');
    document.querySelectorAll('.content').forEach(c => c.classList.remove('active'));
    document.getElementById('container-' + view).classList.add('active');
    
    document.getElementById('tabs-itinerary').style.display = view === 'itinerary' ? 'flex' : 'none';
    document.getElementById('tabs-checklist').style.display = view === 'checklist' ? 'flex' : 'none';
    document.getElementById('tabs-expenses').style.display = view === 'expenses' ? 'flex' : 'none';
    document.getElementById('tabs-notes').style.display = view === 'notes' ? 'flex' : 'none';
}

/* --- 日期與分頁標籤渲染 --- */
const WEEKDAYS = ["週日", "週一", "週二", "週三", "週四", "週五", "週六"];
const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
function renderTabs() {
    const container = document.getElementById('tabs-itinerary'); container.innerHTML = '';
    const start = new Date(appData.meta.startDate); const end = new Date(appData.meta.endDate);
    const diffDays = Math.ceil(Math.abs(end - start) / (1000 * 60 * 60 * 24)) + 1;
    const startStr = `${MONTHS[start.getMonth()]} ${String(start.getDate()).padStart(2, '0')}`;
    const endStr = `${MONTHS[end.getMonth()]} ${String(end.getDate()).padStart(2, '0')}, ${end.getFullYear()}`;
    appData.meta.subtitle = `${startStr} - ${endStr}`;
    document.querySelector('.trip-subtitle').innerText = appData.meta.subtitle;
    for (let i = 0; i < diffDays; i++) {
        const dayId = `d${i + 1}`; const curr = new Date(start); curr.setDate(start.getDate() + i);
        const btn = document.createElement('button'); btn.className = `tab-btn ${currentDay === dayId ? 'active' : ''}`;
        btn.onclick = function () { switchDay(dayId, this); };
        btn.innerHTML = `<span class="tab-date">${WEEKDAYS[curr.getDay()]}</span><span class="tab-day">D${i + 1}</span>`;
        container.appendChild(btn);
    }
}
function openDatePicker() { if(!isEditing) return; document.getElementById('input-start-date').value = appData.meta.startDate; document.getElementById('input-end-date').value = appData.meta.endDate; document.getElementById('date-modal').classList.add('show'); }
function closeDatePicker() { document.getElementById('date-modal').classList.remove('show'); }
function saveDateRange() { 
    const s = document.getElementById('input-start-date').value; const e = document.getElementById('input-end-date').value;
    if(s && e) { appData.meta.startDate = s; appData.meta.endDate = e; currentDay='d1'; renderTabs(); renderSchedule(); saveDataToCloud(true); closeDatePicker(); }
}

/* --- 核心輔助函式 --- */
function updateTitle(v) { appData.meta.title=v.trim(); triggerSave(); }
function updateSubtitle(v) { appData.meta.subtitle=v.trim(); triggerSave(); }
function addExpense() {
    const type = document.getElementById('exp-type').value;
    const name = document.getElementById('exp-name').value;
    const amount = parseFloat(document.getElementById('exp-amount').value);
    const curr = document.getElementById('exp-curr').value;
    
    if(!name || !amount) { alert("請輸入項目和金額"); return; }
    
    // 新增資料結構，包含 type
    appData.expenses.push({ 
        id: Date.now(), 
        type: type, 
        item: name, 
        amount: amount, 
        curr: curr 
    });
    
    // 清空輸入框
    document.getElementById('exp-name').value = '';
    document.getElementById('exp-amount').value = '';
    
    renderExpenses();
    triggerSave();
}
function deleteExpense(id) { if(confirm("刪除？")){appData.expenses=appData.expenses.filter(x=>x.id!==id); renderExpenses(); triggerSave();} }
function updateExchangeRate() { const r=prompt("匯率:", appData.meta.rate); if(r&&!isNaN(r)){appData.meta.rate=parseFloat(r); document.getElementById('current-rate').innerText=r; renderExpenses(); triggerSave();} }
function renderExpenses() { 
    const list = document.getElementById('expenses-list'); 
    list.innerHTML = ''; 
    
    let totalTWD = 0;
    let totalJPY = 0;
    const rate = appData.meta.rate || 0.22;

    // 對應圖示
    const icons = {
        "飲食": "🍴", "交通": "🚄", "購物": "🛍️", 
        "住宿": "🏨", "門票": "🎫", "其他": "💸"
    };

    appData.expenses.forEach(ex => {
        // 計算匯率
        let valTWD = ex.curr === 'TWD' ? ex.amount : Math.round(ex.amount * rate);
        let valJPY = ex.curr === 'JPY' ? ex.amount : Math.round(ex.amount / rate);
        
        totalTWD += valTWD;
        totalJPY += valJPY;
        
        let displayAmount = ex.curr === 'TWD' ? `NT$ ${ex.amount}` : `¥ ${ex.amount}`;
        let subAmount = ex.curr === 'TWD' ? `≈ ¥ ${valJPY}` : `≈ NT$ ${valTWD}`;
        let icon = icons[ex.type] || "💸";

        list.innerHTML += `
            <div class="expense-item">
                <div class="exp-icon">${icon}</div>
                <div class="expense-info">
                    <div class="expense-name">${ex.item}</div>
                    <div class="expense-meta">${ex.type} • ${ex.curr}</div>
                </div>
                <div style="text-align:right;">
                    <div class="expense-price">${displayAmount}</div>
                    <div style="font-size:11px; color:#999;">${subAmount}</div>
                </div>
                <div style="margin-left:15px; color:#FF3B30; cursor:pointer; font-size:18px;" onclick="deleteExpense(${ex.id})">×</div>
            </div>
        `;
    });
    
    // 更新上方總覽
    document.getElementById('total-twd').innerText = `NT$ ${totalTWD.toLocaleString()}`;
    document.getElementById('total-jpy').innerText = `¥ ${totalJPY.toLocaleString()}`;
}
function getPeriod(t) { if(!t||!t.includes(":"))return""; const h=parseInt(t.split(":")[0]); if(h<5)return"深夜"; if(h<11)return"上午"; if(h<14)return"中午"; if(h<18)return"下午"; return"晚上"; }
function renderTypeOptions(v) { let o=`<option value="">選擇</option>`; appData.activityTypes.forEach(t=>{o+=`<option value="${t}" ${t===v?'selected':''}>${t}</option>`}); return o+`<option value="ADD_NEW">➕ 新增...</option><option value="MANAGE_OPTION" style="color:var(--primary-color);">⚙️ 管理...</option>`; }

/* --- 畫面渲染 (Render Schedule) --- */
function renderSchedule() {
    const container=document.getElementById('schedule-container'); container.innerHTML='';
    (appData.itinerary[currentDay]||[]).forEach((item, index) => {
        const div=document.createElement('div'); div.className='timeline-item'; div.setAttribute('data-index', index);
        let mapUrl=`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent((item.loc||"").replace(/📍|🚗|🚄|✈️/g,'').trim())}`;
        let hasMemo=(item.memo||"").length>0;
        
        // 直接寫入 Style 確保編輯按鈕顯示，不受 CSS 衝突影響
        const delBtnStyle = isEditing ? 'display:flex !important;' : 'display:none;';
        const handleStyle = isEditing ? 'display:block !important;' : 'display:none;';
        const typeBadgeStyle = isEditing ? 'display:none !important;' : 'display:inline-block;';
        const typeSelectStyle = isEditing ? 'display:block !important;' : 'display:none;';
        
        div.innerHTML=`
            <div class="drag-handle" style="${handleStyle}"><i class="fas fa-bars"></i></div>
            <div class="card">
                <div class="delete-btn" onclick="deleteItem(${index})" style="${delBtnStyle}">✕</div>
                <div class="time-col">
                    <div class="ampm">${getPeriod(item.time)}</div>
                    <div class="time" onblur="updateTimeText(${index},this.innerText)">${item.time}</div>
                    <div class="type-badge" style="${typeBadgeStyle}">${item.type||""}</div>
                    <select class="type-select" style="${typeSelectStyle}" onchange="updateType(${index},this.value)">${renderTypeOptions(item.type||"")}</select>
                </div>
                <div class="info-col">
                    <div class="info-title" onblur="updateItinerary(${index},'title',this.innerText)">${item.title}</div>
                    <div class="info-loc"><span onblur="updateLoc(${index},this.innerText)">${item.loc}</span><a href="${mapUrl}" target="_blank" class="nav-btn"><i class="fas fa-location-arrow"></i> 導航</a></div>
                    <div class="info-note" onblur="updateItinerary(${index},'note',this.innerText)">${item.note}</div>
                    <div class="memo-box ${hasMemo?'show':''}" onblur="updateItinerary(${index},'memo',this.innerText)">${item.memo||""}</div>
                    <div class="memo-controls" style="display:none;margin-top:5px;font-size:12px;"><span onclick="toggleMemo(${index})" style="color:#007AFF;cursor:pointer;">${hasMemo?'刪除備忘':'新增備忘'}</span></div>
                </div>
            </div>`;
        if(isEditing) div.querySelector('.memo-controls').style.display='block'; container.appendChild(div);
    });
    setEditable(isEditing);
    if(isEditing) { 
        if(sortableInstance) sortableInstance.destroy(); 
        sortableInstance = new Sortable(container, { handle:'.drag-handle', animation:150, onEnd: function(evt){ const list=appData.itinerary[currentDay]; list.splice(evt.newIndex, 0, list.splice(evt.oldIndex, 1)[0]); triggerSave(); } }); 
    }
}

function updateLoc(i, v) { if(appData.itinerary[currentDay][i]){ appData.itinerary[currentDay][i].loc=v.trim(); renderSchedule(); triggerSave(); } }
function updateTimeText(i, v) { if(appData.itinerary[currentDay][i]){ appData.itinerary[currentDay][i].time=v.trim(); renderSchedule(); triggerSave(); } }
function updateItinerary(i, k, v) { if(appData.itinerary[currentDay][i]){ appData.itinerary[currentDay][i][k]=v.trim(); triggerSave(); } }
function toggleMemo(i) { const item=appData.itinerary[currentDay][i]; item.memo=item.memo?"":"備忘..."; renderSchedule(); triggerSave(); }
function updateType(i, v) { if(v==="ADD_NEW"){const n=prompt("新標籤："); if(n){appData.activityTypes.push(n); appData.itinerary[currentDay][i].type=n; saveDataToCloud(true); renderSchedule();} else renderSchedule();} else if(v==="MANAGE_OPTION"){openTagsManager(); renderSchedule();} else {appData.itinerary[currentDay][i].type=v; triggerSave();} }

function renderChecklist() { const container=document.getElementById('checklist-container'); container.innerHTML=''; const list=currentChecklistType==='pre'?appData.checklist_pre:appData.checklist_tour; (list||[]).forEach((cat, ci)=>{ let h=''; cat.items.forEach((item, ii)=>{ h+=`<div class="check-item ${item.checked?'checked':''}"><div class="custom-checkbox" onclick="toggleCheck(${ci},${ii})"><i>✔</i></div><div class="item-text" onblur="updCheck(${ci},${ii},this.innerText)">${item.text}</div><div class="del-check-btn" onclick="delCheck(${ci},${ii})">✕</div></div>`; }); const div=document.createElement('div'); div.className='checklist-category'; div.innerHTML=`<div class="cat-title"><span onblur="updCat(${ci},this.innerText)">${cat.category}</span><span class="del-cat-btn" onclick="delCat(${ci})">刪除</span></div><div>${h}</div><div class="add-check-row"><div class="add-check-btn" onclick="addCheck(${ci})">＋ 新增項目</div></div>`; container.appendChild(div); }); setEditable(isEditing); }
function toggleCheck(ci, ii) { if(isEditing)return; const l=getList(); l[ci].items[ii].checked=!l[ci].items[ii].checked; renderChecklist(); triggerSave(); }
function updCheck(ci, ii, v) { getList()[ci].items[ii].text=v.trim(); triggerSave(); }
function updCat(ci, v) { getList()[ci].category=v.trim(); triggerSave(); }
function delCheck(ci, ii) { if(confirm("刪除？")){ getList()[ci].items.splice(ii,1); renderChecklist(); triggerSave(); }}
function addCheck(ci) { getList()[ci].items.push({text:"新項目", checked:false}); renderChecklist(); triggerSave(); }
function delCat(ci) { if(confirm("刪除分類？")){ getList().splice(ci,1); renderChecklist(); triggerSave(); }}
function addNewCategory() { getList().push({category:"新分類", items:[]}); renderChecklist(); triggerSave(); }
function getList() { return currentChecklistType==='pre'?appData.checklist_pre:appData.checklist_tour; }

function openTagsManager() { renderTagsList(); document.getElementById('tags-modal').classList.add('show'); }
function closeTagsManager() { document.getElementById('tags-modal').classList.remove('show'); renderSchedule(); }
function renderTagsList() { const c=document.getElementById('tags-list-container'); c.innerHTML=''; appData.activityTypes.forEach(t=>{ const d=document.createElement('div'); d.style.cssText='display:flex;justify-content:space-between;padding:12px;border-bottom:1px solid #eee;'; d.innerHTML=`<span>${t}</span><span style="color:red;cursor:pointer;" onclick="deleteTag('${t}')">✕</span>`; c.appendChild(d); }); }
function deleteTag(t) { if(confirm("刪除標籤？")){ appData.activityTypes=appData.activityTypes.filter(x=>x!==t); saveDataToCloud(true); renderTagsList(); } }

/* --- 切換編輯模式 --- */
function toggleEditMode() {
    if(!isEditing && !sessionStorage.getItem('isAuth')) { const p=prompt("密碼："); if(p!=="8888"){alert("錯誤");return;} sessionStorage.setItem('isAuth','true'); }
    isEditing = !isEditing;
    document.querySelector('.edit-toggle').classList.toggle('editing', isEditing);
    document.body.classList.toggle('is-editing', isEditing);
    document.querySelector('.trip-title').contentEditable = isEditing;
    document.querySelector('.trip-subtitle').style.cursor = isEditing ? "pointer" : "default";
    document.querySelector('.trip-subtitle').style.borderBottom = isEditing ? "1px dashed rgba(255,255,255,0.5)" : "none";
    
    const disp = isEditing ? 'block' : 'none';
    document.querySelectorAll('.add-btn-container').forEach(e => e.style.setProperty('display', disp, 'important'));
    document.querySelectorAll('.del-check-btn, .del-cat-btn, .add-check-row, .add-cat-btn').forEach(e => e.style.setProperty('display', disp, 'important'));

    setEditable(isEditing); renderSchedule(); renderChecklist(); renderNotesGrid();
}

function switchDay(d, b) { currentDay=d; document.querySelectorAll('#tabs-itinerary .tab-btn').forEach(e=>e.classList.remove('active')); b.classList.add('active'); renderSchedule(); }
function switchChecklistType(t, b) { currentChecklistType=t; document.querySelectorAll('.sub-tab-btn').forEach(e=>e.classList.remove('active')); b.classList.add('active'); renderChecklist(); }
function setEditable(e) { document.querySelectorAll('.info-title, .info-loc span, .info-note, .memo-box, .item-text, .cat-title span, .time').forEach(f => { f.contentEditable = e; }); }
function addNewItem() { if(!appData.itinerary[currentDay]) appData.itinerary[currentDay]=[]; appData.itinerary[currentDay].push({id:Date.now(), time:"12:00", type:"✈️ 飛行", title:"新行程", loc:"地點", note:"", memo:""}); renderSchedule(); triggerSave(); }
function deleteItem(i) { if(confirm('刪除？')){ appData.itinerary[currentDay].splice(i,1); renderSchedule(); triggerSave(); }}
function showStatus(m, e){ const el=document.getElementById('status-indicator'); el.innerText=m; el.classList.add('show'); if(e) el.style.background='red'; else el.style.background='rgba(0,0,0,0.8)'; }
function hideStatus(){ document.getElementById('status-indicator').classList.remove('show'); }
document.addEventListener('paste', function (e) { if (e.target.isContentEditable) { e.preventDefault(); const t = (e.clipboardData || window.clipboardData).getData('text'); document.execCommand('insertText', false, t); } });