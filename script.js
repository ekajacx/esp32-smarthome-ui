const espIp = "http://192.168.1.234";
const rNames = ["Lampu Parkir", "Lampu Taman Baru", "Lampu Teras Samping", "Stop Kontak"];
let activeSchedRelay = 1, selectedModalDay = 0, tempBuffer = {}, masterTempBuffer = {};
let currentLogFilter = 'ALL', rawLogsCache = '', isMasterExpandOpen = false;
let uptimeSeconds = 0, isOnline = false, audioCtx = null;

function playClickSound() {
  try {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    let osc = audioCtx.createOscillator(); let gain = audioCtx.createGain();
    osc.type = 'sine'; osc.frequency.setValueAtTime(600, audioCtx.currentTime);
    gain.gain.setValueAtTime(0.08, audioCtx.currentTime); gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.05);
    osc.connect(gain); gain.connect(audioCtx.destination); osc.start(); osc.stop(audioCtx.currentTime + 0.05);
  } catch(e) {}
}

function playSuccessSound() {
  try {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    let now = audioCtx.currentTime;
    let osc = audioCtx.createOscillator(); let gain = audioCtx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(440, now);
    osc.frequency.setValueAtTime(554.37, now + 0.1);
    osc.frequency.setValueAtTime(659.25, now + 0.2);
    gain.gain.setValueAtTime(0.12, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);
    osc.connect(gain); gain.connect(audioCtx.destination); osc.start(now); osc.stop(now + 0.4);
  } catch(e) {}
}

function togglePassword() {
  playClickSound();
  let passInput = document.getElementById('passInput');
  let eyeBtn = document.getElementById('eyeBtn');
  if (passInput.type === 'password') { passInput.type = 'text'; eyeBtn.innerText = '👁️‍🗨️'; }
  else { passInput.type = 'password'; eyeBtn.innerText = '👁️'; }
}

function toggleTheme() {
  playClickSound();
  document.body.classList.toggle('light-mode');
  localStorage.setItem('theme', document.body.classList.contains('light-mode') ? 'light' : 'dark');
}

const titleText = 'LOCAL SMART HOME RELAY CONTROLLER';
let titleIdx = 0;
function typeWriterTitle() {
  let el = document.getElementById('typingTitle');
  if (el && titleIdx < titleText.length) {
    el.innerHTML = titleText.substring(0, titleIdx + 1) + '<span class="typing-cursor"></span>';
    titleIdx++;
    setTimeout(typeWriterTitle, 75);
  } else if (el) {
    el.innerHTML = titleText + '<span class="typing-cursor"></span>';
  }
}

function checkLoginLock() {
  let lockUntil = parseInt(localStorage.getItem('login_lock_until') || '0');
  let now = Date.now();
  let btn = document.getElementById('submitBtn');
  let errBox = document.getElementById('errorMsgBox');
  if (lockUntil > now) {
    let secLeft = Math.ceil((lockUntil - now) / 1000);
    if (btn) btn.disabled = true;
    if (errBox) {
      errBox.style.display = 'block';
      errBox.innerHTML = '⚠️ Terlalu banyak percobaan gagal (3x). Coba lagi dalam ' + secLeft + ' detik.';
    }
    setTimeout(checkLoginLock, 500);
  } else {
    if (lockUntil > 0) {
      localStorage.removeItem('login_fails');
      localStorage.removeItem('login_lock_until');
    }
    if (btn) btn.disabled = false;
    if (errBox) { errBox.style.display = 'none'; errBox.innerHTML = ''; }
  }
}

function handleLoginSubmit(event) {
  event.preventDefault();
  let lockUntil = parseInt(localStorage.getItem('login_lock_until') || '0');
  if (lockUntil > Date.now()) return;
  
  let u = document.getElementById('userInput').value;
  let p = document.getElementById('passInput').value;
  
  if (u === "Jacx" && p === "halo123") {
    playSuccessSound();
    if(document.getElementById('rememberMe').checked) { localStorage.setItem('saved_user', u); }
    else { localStorage.removeItem('saved_user'); }
    sessionStorage.setItem('is_logged_in', 'true');
    checkAuthSession();
  } else {
    let card = document.getElementById('login-card-box');
    card.classList.add('shake');
    setTimeout(() => card.classList.remove('shake'), 400);
    let fails = parseInt(localStorage.getItem('login_fails') || '0') + 1;
    localStorage.setItem('login_fails', fails);
    let errBox = document.getElementById('errorMsgBox');
    errBox.style.display = 'block';
    errBox.innerHTML = 'Username atau Password Salah!';
    if (fails >= 3) {
      let lockTime = Date.now() + 15000;
      localStorage.setItem('login_lock_until', lockTime);
      checkLoginLock();
    }
  }
}

function doLogout() {
  sessionStorage.removeItem('is_logged_in');
  localStorage.removeItem('login_fails');
  localStorage.removeItem('login_lock_until');
  checkAuthSession();
}

function checkAuthSession() {
  let logged = sessionStorage.getItem('is_logged_in');
  if (logged === 'true') {
    document.getElementById('login-view').style.display = 'none';
    document.getElementById('dashboard-view').style.display = 'block';
    updateData();
  } else {
    document.getElementById('login-view').style.display = 'block';
    document.getElementById('dashboard-view').style.display = 'none';
    typeWriterTitle();
    checkLoginLock();
    let savedUser = localStorage.getItem('saved_user');
    if(savedUser) { document.getElementById('userInput').value = savedUser; document.getElementById('rememberMe').checked = true; }
  }
}

function toggleMasterExpand() {
  isMasterExpandOpen = !isMasterExpandOpen;
  let panel = document.getElementById('master-expand-panel');
  let btn = document.getElementById('expand-master-btn-text');
  if(isMasterExpandOpen) { panel.style.display = 'block'; btn.innerText = '▲ Tutup Lihat Jadwal Global'; }
  else { panel.style.display = 'none'; btn.innerText = '▼ Lihat Jadwal Global'; }
}

function setLogFilter(cat) {
  currentLogFilter = cat;
  let btns = document.querySelectorAll('.log-filter-btn');
  btns.forEach(b => b.classList.remove('active-filter'));
  document.getElementById('btn-filter-' + cat).classList.add('active-filter');
  renderFilteredLogs();
}

function renderFilteredLogs() {
  let lines = rawLogsCache.split('<br>');
  let filtered = '';
  for(let line of lines) {
    if(!line.trim()) continue;
    if(currentLogFilter === 'ALL' || line.includes('[' + currentLogFilter + ']')) {
      let colorClass = 'log-kontrol';
      if(line.includes('[Peringatan]')) colorClass = 'log-peringatan';
      else if(line.includes('[Otomatis]')) colorClass = 'log-otomatis';
      filtered += '<span class="log-item ' + colorClass + '">' + line + '</span>';
    }
  }
  if(!filtered) { filtered = '<span style="color:var(--sub-text); padding:4px; display:block;">> SYSTEM: Tidak ada data log ditemukan.</span>'; }
  let logBox = document.getElementById('log-box');
  let isAtBottom = (logBox.scrollHeight - logBox.scrollTop <= logBox.clientHeight + 40);
  logBox.innerHTML = filtered;
  if(isAtBottom) { logBox.scrollTop = logBox.scrollHeight; }
}

function updateModalDayIndicators() {
  for(let d=0; d<7; d++) {
    let box = document.getElementById('modal-day-' + d);
    if (!box) continue;
    let dData = (activeSchedRelay === 99) ? (masterTempBuffer[d] || null) : (tempBuffer[activeSchedRelay] ? tempBuffer[activeSchedRelay][d] : null);
    let hasVal = (dData && dData.on && dData.off && dData.on !== '' && dData.off !== '');
    if (hasVal) box.classList.add('has-schedule'); else box.classList.remove('has-schedule');
  }
}

function validateModalSaveButton() {
  let currentOn = document.getElementById('modal-on-time').value;
  let currentOff = document.getElementById('modal-off-time').value;
  if (activeSchedRelay === 99) { masterTempBuffer[selectedModalDay] = { on: currentOn, off: currentOff }; }
  else if(tempBuffer[activeSchedRelay]) { tempBuffer[activeSchedRelay][selectedModalDay] = { on: currentOn, off: currentOff }; }
  updateModalDayIndicators();
  let hasValidSchedule = false;
  let checkList = (activeSchedRelay === 99) ? masterTempBuffer : tempBuffer[activeSchedRelay];
  if (checkList) {
    for(let d=0; d<7; d++) {
      let dData = checkList[d];
      if(dData && dData.on && dData.off && dData.on !== '' && dData.off !== '') hasValidSchedule = true;
    }
  }
  document.getElementById('modal-save-btn').disabled = !hasValidSchedule;
}

function clickAturMasterJadwal() {
  let hasAnyMasterActive = false;
  for(let d=0; d<7; d++) {
    let mOn = document.getElementById('master-on-' + d).value;
    let mOff = document.getElementById('master-off-' + d).value;
    if(mOn && mOff && mOn !== '00:00' && mOff !== '00:00') { hasAnyMasterActive = true; break; }
  }
  if(hasAnyMasterActive) showCustomConfirm('Jadwal Global sudah diatur. Apakah Anda ingin mengatur ulang jadwal?', openMasterSchedModal);
  else openMasterSchedModal();
}

function openMasterSchedModal() {
  activeSchedRelay = 99;
  document.getElementById('modal-sched-title').innerText = 'Atur Jadwal Global';
  document.getElementById('apply-checkbox-container').style.display = 'block';
  for(let i=1; i<=4; i++) {
    let isIdentical = true;
    for(let d=0; d<7; d++) {
      let mOn = document.getElementById('master-on-' + d).value;
      let mOff = document.getElementById('master-off-' + d).value;
      let rOn = document.getElementById('on-val-' + i + '-' + d).value;
      let rOff = document.getElementById('off-val-' + i + '-' + d).value;
      if (rOn !== mOn || rOff !== mOff) { isIdentical = false; break; }
    }
    let chk = document.getElementById('apply-r' + i); if (chk) chk.checked = isIdentical;
  }
  masterTempBuffer = {};
  for(let d=0; d<7; d++) {
    let onV = document.getElementById('master-on-' + d).value;
    let offV = document.getElementById('master-off-' + d).value;
    masterTempBuffer[d] = { on: (onV && onV !== '00:00') ? onV : '', off: (offV && offV !== '00:00') ? offV : '' };
  }
  selectModalDay(0);
  document.getElementById('sched-modal').style.display = 'flex';
}

function clickAturRelayJadwal(num) {
  let hasAnyRelayActive = false;
  for(let d=0; d<7; d++) {
    let rOn = document.getElementById('on-val-' + num + '-' + d).value;
    let rOff = document.getElementById('off-val-' + num + '-' + d).value;
    if(rOn && rOff && rOn !== '00:00' && rOff !== '00:00') { hasAnyRelayActive = true; break; }
  }
  let relayTitleStr = 'R' + num + ' (' + rNames[num - 1] + ')';
  if(hasAnyRelayActive) showCustomConfirm('Jadwal untuk ' + relayTitleStr + ' sudah ada. Apakah Anda ingin mengatur ulang jadwal?', () => openSchedModal(num));
  else openSchedModal(num);
}

function openSchedModal(num) {
  activeSchedRelay = num;
  document.getElementById('modal-sched-title').innerText = 'Atur Jadwal R' + num + ' (' + rNames[num - 1] + ')';
  document.getElementById('apply-checkbox-container').style.display = 'none';
  tempBuffer[num] = {};
  for(let d=0; d<7; d++) {
    let onV = document.getElementById('on-val-' + num + '-' + d).value;
    let offV = document.getElementById('off-val-' + num + '-' + d).value;
    tempBuffer[num][d] = { on: (onV && onV !== '00:00') ? onV : '', off: (offV && offV !== '00:00') ? offV : '' };
  }
  selectModalDay(0);
  document.getElementById('sched-modal').style.display = 'flex';
}

function closeSchedModal() { document.getElementById('sched-modal').style.display = 'none'; }
function openPreviewModal(num) {
  let daysFull = ['MINGGU', 'SENIN', 'SELASA', 'RABU', 'KAMIS', 'JUMAT', 'SABTU'];
  document.getElementById('preview-modal-title').innerText = 'Jadwal R' + num + ' (' + rNames[num - 1] + ')';
  let listHtml = ''; let hasAny = false;
  for(let d=0; d<7; d++) {
    let onV = document.getElementById('on-val-' + num + '-' + d).value;
    let offV = document.getElementById('off-val-' + num + '-' + d).value;
    if(onV && offV && onV !== '00:00' && offV !== '00:00') {
      hasAny = true;
      listHtml += '<div class="preview-item"><span class="preview-day">' + daysFull[d] + '</span><span class="preview-time">ON: ' + onV + ' | OFF: ' + offV + '</span></div>';
    }
  }
  if(!hasAny) listHtml = '<div style="text-align:center; font-size:10px; color:var(--sub-text); padding:10px;">Tidak ada jadwal aktif</div>';
  document.getElementById('preview-list-content').innerHTML = listHtml;
  document.getElementById('preview-modal').style.display = 'flex';
}
function closePreviewModal() { document.getElementById('preview-modal').style.display = 'none'; }

function setRelayMode(num, mode) {
  if (mode === 'manual') {
    let hasSched = false;
    for(let d=0; d<7; d++) { let val = document.getElementById('on-val-' + num + '-' + d).value; if(val && val !== '00:00') { hasSched = true; break; } }
    let btnAuto = document.getElementById('btn-auto-' + num);
    if(btnAuto && btnAuto.classList.contains('active-auto') && hasSched) { showCustomAlert('Harap hapus jadwal terlebih dahulu untuk mengubah ke mode manual!'); return; }
  }
  fetch(espIp + `/setmode?r=${num}&mode=${mode}`).then(res => updateData());
}

function syncRelayWithMaster(num) {
  showCustomConfirm('Samakan jadwal R' + num + ' (' + rNames[num - 1] + ') dengan Jadwal Global?', () => {
    fetch(espIp + '/sync-relay?r=' + num).then(res => updateData());
  });
}

function selectModalDay(dayIdx) {
  let currentOn = document.getElementById('modal-on-time').value;
  let currentOff = document.getElementById('modal-off-time').value;
  if (activeSchedRelay === 99) masterTempBuffer[selectedModalDay] = { on: currentOn, off: currentOff };
  else tempBuffer[activeSchedRelay][selectedModalDay] = { on: currentOn, off: currentOff };
  selectedModalDay = dayIdx;
  for(let d=0; d<7; d++) {
    let box = document.getElementById('modal-day-' + d);
    if(d === dayIdx) box.classList.add('selected-day'); else box.classList.remove('selected-day');
  }
  let targetData = (activeSchedRelay === 99) ? masterTempBuffer[dayIdx] : tempBuffer[activeSchedRelay][dayIdx];
  document.getElementById('modal-on-time').value = targetData ? targetData.on : '';
  document.getElementById('modal-off-time').value = targetData ? targetData.off : '';
  validateModalSaveButton();
}

function clearCurrentDay() {
  document.getElementById('modal-on-time').value = ''; document.getElementById('modal-off-time').value = '';
  if (activeSchedRelay === 99) masterTempBuffer[selectedModalDay] = { on: '', off: '' };
  else tempBuffer[activeSchedRelay][selectedModalDay] = { on: '', off: '' };
  validateModalSaveButton();
}

function saveModalSchedule() {
  let currentOn = document.getElementById('modal-on-time').value;
  let currentOff = document.getElementById('modal-off-time').value;
  if (activeSchedRelay === 99) {
    masterTempBuffer[selectedModalDay] = { on: currentOn, off: currentOff };
    let applyList = [];
    for(let i=1; i<=4; i++) { let chk = document.getElementById('apply-r' + i); if(chk && chk.checked) applyList.push(i); }
    let promises = [];
    for(let d=0; d<7; d++) {
      let dData = masterTempBuffer[d];
      let onStr = (dData && dData.on) ? dData.on : '00:00';
      let offStr = (dData && dData.off) ? dData.off : '00:00';
      promises.push(fetch(espIp + `/master-schedule?day=${d}&on=${onStr}&off=${offStr}&active=` + (dData && dData.on ? '1' : '0') + '&applyTo=' + encodeURIComponent(applyList.join(','))));
    }
    Promise.all(promises).then(res => { closeSchedModal(); showCustomAlert('Jadwal Global berhasil diterapkan!'); updateData(); });
  } else {
    let num = activeSchedRelay;
    tempBuffer[num][selectedModalDay] = { on: currentOn, off: currentOff };
    let promises = [];
    for(let d=0; d<7; d++) {
      let dData = tempBuffer[num][d];
      let onStr = (dData && dData.on) ? dData.on : '00:00';
      let offStr = (dData && dData.off) ? dData.off : '00:00';
      promises.push(fetch(espIp + `/schedule?r=${num}&day=${d}&on=${onStr}&off=${offStr}&active=` + (dData && dData.on ? '1' : '0')));
    }
    Promise.all(promises).then(res => { closeSchedModal(); showCustomAlert('Jadwal berhasil disimpan!'); updateData(); });
  }
}

function showCustomAlert(message) {
  document.getElementById('modal-icon').innerText = '🎉';
  document.getElementById('custom-modal-msg').innerText = message;
  document.getElementById('modal-cancel-btn').style.display = 'none';
  let okBtn = document.getElementById('modal-ok-btn'); okBtn.innerText = 'OK';
  okBtn.onclick = () => document.getElementById('custom-modal').style.display = 'none';
  document.getElementById('custom-modal').style.display = 'flex';
}

function showCustomConfirm(message, onConfirmCallback) {
  document.getElementById('modal-icon').innerText = '❓';
  document.getElementById('custom-modal-msg').innerText = message;
  let cancelBtn = document.getElementById('modal-cancel-btn'); cancelBtn.style.display = 'block';
  cancelBtn.onclick = () => document.getElementById('custom-modal').style.display = 'none';
  let okBtn = document.getElementById('modal-ok-btn'); okBtn.innerText = 'OK';
  okBtn.onclick = () => { document.getElementById('custom-modal').style.display = 'none'; onConfirmCallback(); };
  document.getElementById('custom-modal').style.display = 'flex';
}

setInterval(() => {
  if (isOnline) {
    uptimeSeconds++;
    let d = Math.floor(uptimeSeconds / 86400);
    let h = Math.floor((uptimeSeconds % 86400) / 3600);
    let m = Math.floor((uptimeSeconds % 3600) / 60);
    let s = uptimeSeconds % 60;
    let el = document.getElementById('uptime-display'); if(el) el.innerText = d + 'd : ' + h + 'h : ' + m + 'm : ' + s + 's';
  }
}, 1000);

// Optimistic UI: Tombol langsung merespon instan di layar
function toggleRelay(num) {
  playClickSound();
  let sw = document.getElementById('sw' + num);
  let bulb = document.getElementById('bulb' + num);
  sw.checked = !sw.checked;
  if(sw.checked) { bulb.setAttribute('class', 'bulb-icon bulb-on'); }
  else { bulb.setAttribute('class', 'bulb-icon bulb-off'); }

  fetch(espIp + '/toggle?r=' + num).then(res => {
    setTimeout(updateData, 200);
  });
}

function masterControl(action) { playClickSound(); fetch(espIp + '/master?action=' + action).then(res => updateData()); }

function updateData() {
  fetch(espIp + '/data').then(res => res.json()).then(obj => {
    if (!obj) return;
    isOnline = true;
    document.getElementById('status-box').innerHTML = '<span class="status-dot"></span><span class="status-text">ONLINE</span>';
    
    // Indikator Wi-Fi real-time
    if (obj.ssid) {
      document.getElementById('wifi-ssid-text').innerText = obj.ssid + " (" + obj.rssi + " dBm)";
    }

    document.getElementById('temp').innerHTML = obj.temp.toFixed(1) + ' &deg;C';
    document.getElementById('hum').innerHTML = obj.hum.toFixed(1) + ' %';
    document.getElementById('temp-stat').innerText = 'Min: ' + obj.minT.toFixed(1) + '°C | Max: ' + obj.maxT.toFixed(1) + '°C';
    document.getElementById('hum-stat').innerText = 'Min: ' + obj.minH.toFixed(1) + '% | Max: ' + obj.maxH.toFixed(1) + '%';
    let tBox = document.getElementById('temp-box');
    if(obj.temp >= 35.0) tBox.classList.add('alert-active'); else tBox.classList.remove('alert-active');
    rawLogsCache = obj.logs; renderFilteredLogs();
    document.getElementById('export-link-btn').href = espIp + '/export';

    let hasMasterActive = false; let daysFull = ['MINGGU', 'SENIN', 'SELASA', 'RABU', 'KAMIS', 'JUMAT', 'SABTU']; let expandListHtml = '';
    for(let d=0; d<7; d++) {
      let onV = (obj.masterSched[d].active && obj.masterSched[d].on !== '00:00') ? obj.masterSched[d].on : '';
      let offV = (obj.masterSched[d].active && obj.masterSched[d].off !== '00:00') ? obj.masterSched[d].off : '';
      document.getElementById('master-on-' + d).value = onV;
      document.getElementById('master-off-' + d).value = offV;
      if(obj.masterSched[d].active && obj.masterSched[d].on !== '00:00') {
        hasMasterActive = true;
        expandListHtml += '<div class="lcd-expand-item"><span class="lcd-day-name">' + daysFull[d] + '</span><span class="lcd-time-val"><span style="color:var(--accent-green);">ON: ' + onV + '</span> <span style="color:var(--accent-yellow);">|</span> <span style="color:var(--accent-red);">OFF: ' + offV + '</span></span></div>';
      } else {
        expandListHtml += '<div class="lcd-expand-item"><span class="lcd-day-name">' + daysFull[d] + '</span><span class="lcd-empty-val">TIDAK ADA JADWAL</span></div>';
      }
    }
    document.getElementById('master-expand-list').innerHTML = expandListHtml;
    document.getElementById('master-del-btn').style.display = hasMasterActive ? 'block' : 'none';
    document.getElementById('expand-master-btn').style.display = hasMasterActive ? 'block' : 'none';
    let masterBtnEl = document.getElementById('master-sched-btn'); if (masterBtnEl) masterBtnEl.innerText = hasMasterActive ? 'Edit Jadwal Global' : 'Atur Jadwal Global';
    if(!hasMasterActive && isMasterExpandOpen) toggleMasterExpand();

    let now = new Date(); let currentDayOfWeek = now.getDay(); let currentTotalSec = now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds();
    let manualRelayCount = 0; let manualRelayOnCount = 0; let manualRelayOffCount = 0; let lcdColsHtml = '';

    for(let i=0; i<4; i++) {
      let card = document.getElementById('card-' + (i+1));
      let sw = document.getElementById('sw' + (i+1));
      let bulb = document.getElementById('bulb' + (i+1));
      let stLabel = document.getElementById('sched-status-' + (i+1));
      let modeStatusEl = document.getElementById('mode-status-' + (i+1));
      let delBtn = document.getElementById('del-btn-' + (i+1));
      let openSchedBtn = document.getElementById('open-sched-btn-' + (i+1));
      let btnMan = document.getElementById('btn-man-' + (i+1));
      let btnAuto = document.getElementById('btn-auto-' + (i+1));
      let syncBtn = document.getElementById('sync-btn-' + (i+1));
      
      let isAuto = obj.autoModes[i];
      if (isAuto) {
        btnAuto.classList.add('active-auto'); btnMan.classList.remove('active-manual');
        sw.disabled = true; openSchedBtn.disabled = false;
        modeStatusEl.className = 'auto-mode-text'; modeStatusEl.innerText = 'Mode Auto Aktif';
      } else {
        btnMan.classList.add('active-manual'); btnAuto.classList.remove('active-auto');
        sw.disabled = false; openSchedBtn.disabled = true; delBtn.disabled = true;
        modeStatusEl.className = 'mode-status-text'; modeStatusEl.innerText = 'Mode Manual Aktif';
        manualRelayCount++; if (obj.relays[i]) manualRelayOnCount++; else manualRelayOffCount++;
      }

      if(obj.relays[i]) { sw.checked = true; bulb.setAttribute('class', 'bulb-icon bulb-on'); }
      else { sw.checked = false; bulb.setAttribute('class', 'bulb-icon bulb-off'); }
      
      let hasAnySched = false; let isIdenticalToMaster = true;
      for(let d=0; d<7; d++) {
        let onValServer = (obj.schedules[i][d].active && obj.schedules[i][d].on !== '00:00') ? obj.schedules[i][d].on : '';
        let offValServer = (obj.schedules[i][d].active && obj.schedules[i][d].off !== '00:00') ? obj.schedules[i][d].off : '';
        document.getElementById('on-val-' + (i+1) + '-' + d).value = onValServer;
        document.getElementById('off-val-' + (i+1) + '-' + d).value = offValServer;
        if(obj.schedules[i][d].active && obj.schedules[i][d].on !== '00:00') hasAnySched = true;
        let mOn = (obj.masterSched[d].active && obj.masterSched[d].on !== '00:00') ? obj.masterSched[d].on : '';
        let mOff = (obj.masterSched[d].active && obj.masterSched[d].off !== '00:00') ? obj.masterSched[d].off : '';
        if(onValServer !== mOn || offValServer !== mOff) isIdenticalToMaster = false;
      }

      if (isAuto) { openSchedBtn.disabled = false; delBtn.disabled = !hasAnySched; }
      openSchedBtn.innerText = hasAnySched ? 'Edit Jadwal' : 'Atur Jadwal';

      card.classList.remove('sync-glow', 'custom-glow', 'green-glow', 'manual-on-glow');
      if (!isAuto && obj.relays[i]) {
        card.classList.add('manual-on-glow');
      } else if (isAuto && hasAnySched) {
        if (hasMasterActive) {
          if (isIdenticalToMaster) card.classList.add('sync-glow');
          else card.classList.add('custom-glow');
        } else card.classList.add('green-glow');
      }
      syncBtn.disabled = (!hasMasterActive || !isAuto || (isIdenticalToMaster && hasAnySched));

      if (!hasMasterActive) lcdColsHtml += '<div class="lcd-col"><span style="color:var(--sub-text);">R' + (i+1) + '<br>--</span></div>';
      else {
        if (isAuto && isIdenticalToMaster && hasAnySched) lcdColsHtml += '<div class="lcd-col"><span style="color:var(--accent-cyan);">R' + (i+1) + '<br>SYNC</span></div>';
        else lcdColsHtml += '<div class="lcd-col"><span style="color:var(--accent-yellow);">R' + (i+1) + '<br>CUSTOM</span></div>';
      }

      if(hasAnySched) {
        let todaySched = obj.schedules[i][currentDayOfWeek];
        let activeToday = (isAuto && todaySched.active && todaySched.on !== '00:00');
        let isCurrentlyOn = false; let isPastOff = false; let targetSec = 0; let eventName = 'AKAN HIDUP';
        let displayOnToday = '--:--'; let displayOffToday = '--:--'; let onClassToday = '';
        let nextSchedData = null; let foundNextStep = -1;

        if (activeToday) {
          let onSec = todaySched.onH * 3600 + todaySched.onM * 60;
          let offSec = todaySched.offH * 3600 + todaySched.offM * 60;
          if (onSec < offSec) {
            isCurrentlyOn = (currentTotalSec >= onSec && currentTotalSec < offSec);
            isPastOff = (currentTotalSec >= offSec);
          } else {
            isCurrentlyOn = (currentTotalSec >= onSec || currentTotalSec < offSec);
            isPastOff = (currentTotalSec >= offSec && currentTotalSec < onSec);
          }
          if (!isPastOff) { displayOnToday = todaySched.on; displayOffToday = todaySched.off; onClassToday = isCurrentlyOn ? 'sched-badge-on-active' : ''; }
          if (isCurrentlyOn) {
            if (onSec < offSec) targetSec = offSec - currentTotalSec;
            else targetSec = (currentTotalSec >= onSec) ? (86400 - currentTotalSec + offSec) : (offSec - currentTotalSec);
            eventName = 'AKAN MATI';
          } else if (currentTotalSec < onSec) { targetSec = onSec - currentTotalSec; eventName = 'AKAN HIDUP'; }
        }

        for (let step = 1; step <= 6; step++) {
          let nextDayIdx = (currentDayOfWeek + step) % 7;
          let nextSched = obj.schedules[i][nextDayIdx];
          if (isAuto && nextSched.active && nextSched.on !== '00:00') {
            let nextOnSec = nextSched.onH * 3600 + nextSched.onM * 60;
            let calcTargetSec = (86400 - currentTotalSec) + ((step - 1) * 86400) + nextOnSec;
            foundNextStep = step; nextSchedData = nextSched;
            if (!activeToday || isPastOff) { targetSec = calcTargetSec; eventName = 'AKAN HIDUP'; }
            break;
          }
        }

        let totalDays = Math.floor(targetSec / 86400); let remSec = targetSec % 86400;
        let dh = String(Math.floor(remSec / 3600)).padStart(2, '0');
        let dm = String(Math.floor((remSec % 3600) / 60)).padStart(2, '0');
        let ds = String(remSec % 60).padStart(2, '0');
        let timeStr = targetSec > 0 ? (totalDays > 0 ? totalDays + 'd : ' + dh + 'h : ' + dm + 'm : ' + ds + 's' : dh + 'h : ' + dm + 'm : ' + ds + 's') : '00h : 00m : 00s';

        let innerBadgeHtml = activeToday && !isPastOff ? '<div style="font-size:9.5px; color:var(--accent-cyan); font-weight:800; margin-bottom:4px;">JADWAL HARI INI</div><div class="sched-badge-row"><span class="sched-badge-item ' + onClassToday + '"><span style="color:var(--accent-green);">ON</span> ' + displayOnToday + '</span><span style="color:var(--accent-yellow);">|</span><span class="sched-badge-item"><span style="color:var(--accent-red);">OFF</span> ' + displayOffToday + '</span></div>' : '<div style="font-size:9.5px; color:var(--sub-text); font-weight:800; margin-bottom:4px;">JADWAL HARI INI: KOSONG</div><div class="sched-badge-row"><span class="sched-badge-item"><span style="color:var(--accent-green);">ON</span> --:--</span><span style="color:var(--accent-yellow);">|</span><span class="sched-badge-item"><span style="color:var(--accent-red);">OFF</span> --:--</span></div>';
        
        if (foundNextStep > 0 && nextSchedData) {
          innerBadgeHtml += '<div style="font-size:9.5px; color:var(--accent-cyan); font-weight:800; margin:6px 0 4px 0;">JADWAL SELANJUTNYA (' + daysFull[(currentDayOfWeek + foundNextStep) % 7] + ')</div><div class="sched-badge-row"><span class="sched-badge-item"><span style="color:var(--accent-green);">ON</span> ' + nextSchedData.on + '</span><span style="color:var(--accent-yellow);">|</span><span class="sched-badge-item"><span style="color:var(--accent-red);">OFF</span> ' + nextSchedData.off + '</span></div>';
        }
        stLabel.innerHTML = '<div class="sched-card-container">' + innerBadgeHtml + '<div class="countdown-card"><div class="countdown-label">' + eventName + '</div><div class="countdown-timer">' + timeStr + '</div></div></div>';
      } else stLabel.innerHTML = '';
    }

    let lcdEl = document.getElementById('master-lcd-status'); if (lcdEl) lcdEl.innerHTML = lcdColsHtml;
    document.getElementById('btnOffAll').disabled = (manualRelayCount === 0 || manualRelayOffCount === manualRelayCount);
    document.getElementById('btnOnAll').disabled = (manualRelayCount === 0 || manualRelayOnCount === manualRelayCount);
  }).catch(err => {
    isOnline = false;
    document.getElementById('status-box').innerHTML = '<span class="status-dot offline-dot"></span><span class="status-text">OFFLINE</span>';
  });
}

function deleteRelayTimer(num) {
  showCustomConfirm('Yakin ingin menghapus seluruh jadwal R' + num + ' (' + rNames[num - 1] + ')?', () => {
    fetch(espIp + '/deleteschedule?r=' + num).then(res => { tempBuffer[num] = {}; updateData(); });
  });
}

function deleteMasterTimer() {
  showCustomConfirm('Yakin ingin menghapus Jadwal Global?', () => {
    fetch(espIp + '/delete-master-schedule').then(res => { masterTempBuffer = {}; updateData(); });
  });
}

window.onload = function() {
  if(localStorage.getItem('theme') === 'light') document.body.classList.add('light-mode');
  checkAuthSession();

  let canvas = document.getElementById('bgCanvas');
  let ctx = canvas.getContext('2d');
  function resizeCanvas() { canvas.width = window.innerWidth; canvas.height = window.innerHeight; }
  window.addEventListener('resize', resizeCanvas); resizeCanvas();
  let particles = [];
  for(let i=0; i<35; i++) {
    particles.push({ x: Math.random() * canvas.width, y: Math.random() * canvas.height, vx: (Math.random() - 0.5) * 0.8, vy: (Math.random() - 0.5) * 0.8, radius: Math.random() * 2 + 1 });
  }
  function animateParticles() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    let isLight = document.body.classList.contains('light-mode');
    ctx.fillStyle = isLight ? 'rgba(2, 132, 199, 0.35)' : 'rgba(0, 210, 255, 0.35)';
    ctx.strokeStyle = isLight ? 'rgba(2, 132, 199, 0.08)' : 'rgba(0, 210, 255, 0.08)';
    for(let i=0; i<particles.length; i++) {
      let p = particles[i];
      p.x += p.vx; p.y += p.vy;
      if(p.x < 0 || p.x > canvas.width) p.vx *= -1;
      if(p.y < 0 || p.y > canvas.height) p.vy *= -1;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2); ctx.fill();
      for(let j=i+1; j<particles.length; j++) {
        let p2 = particles[j];
        let dist = Math.hypot(p.x - p2.x, p.y - p2.y);
        if(dist < 110) { ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p2.x, p2.y); ctx.stroke(); }
      }
    }
    requestAnimationFrame(animateParticles);
  }
  animateParticles();
};

setInterval(() => {
  if (sessionStorage.getItem('is_logged_in') === 'true') {
    updateData();
  }
}, 3000);
