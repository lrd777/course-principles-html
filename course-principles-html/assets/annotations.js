/* Standalone, local-only annotations. Inline after annotations-ui.html. */
(() => {
  'use strict';
  function init() {
    const root = document.getElementById('lesson-content');
    const dialog = document.getElementById('annotation-dialog');
    if (!root || !dialog || window.courseAnnotations) return;
    const byId = id => document.getElementById(id);
    const toolbar = byId('annotation-toolbar');
    const live = byId('annotation-live');
    const dialogLive = byId('annotation-dialog-live');
    const list = byId('annotation-list');
    const editor = byId('annotation-editor');
    const noteInput = byId('annotation-note');
    const kindInput = byId('annotation-kind');
    const storageStatus = byId('annotation-storage-status');
    const lessonId = (document.documentElement.dataset.lessonId || root.dataset.lessonId || document.body.dataset.lessonId || '').trim();
    const schema = 'course-annotations/v1';
    const storageKey = 'course-principles-html:annotations:v1:' + lessonId;
    const excludedSelector = '.math,.katex,math,svg,canvas,img,picture,script,style,form,button,input,select,textarea,option,fieldset,label,output,datalist,meter,progress,.quiz,[data-no-annotate],.demo-shell,[contenteditable="true"],iframe,video,audio,[hidden],[aria-hidden="true"]';
    const barrier = '\uFFFC';
    const contextSize = 48;
    const supportsHighlights = !!(window.CSS && CSS.highlights && typeof window.Highlight === 'function');
    const styleNames = {highlight:'高亮', underline:'下划线', note:'评注'};
    let records = [];
    let resolutions = new Map();
    let index;
    let pending = null;
    let editing = null;
    let storage = null;
    let canPersist = false;
    let persistenceProblem = '';
    let toastTimer;
    let suppressSelectionUntil = 0;
    let refreshTimer;
    let opener;

    function copy(value) { return JSON.parse(JSON.stringify(value)); }
    function uid() { return window.crypto && crypto.randomUUID ? crypto.randomUUID() : 'note-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2); }
    function announce(message) {
      clearTimeout(toastTimer);
      live.hidden = dialog.open;
      dialogLive.hidden = !dialog.open;
      (dialog.open ? dialogLive : live).textContent = message;
      toastTimer = setTimeout(() => { live.hidden = true; dialogLive.hidden = true; }, 6500);
    }
    function excluded(node) {
      const element = node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement;
      return !!(element && element.closest(excludedSelector));
    }
    function fingerprint(text) {
      // Two independent 32-bit hashes plus length; offsets also require a quote/context match.
      let a = 2166136261, b = 5381;
      for (let i = 0; i < text.length; i += 1) {
        a = Math.imul(a ^ text.charCodeAt(i), 16777619);
        b = Math.imul(b, 33) ^ text.charCodeAt(i);
      }
      return text.length + ':' + (a >>> 0).toString(16) + ':' + (b >>> 0).toString(16);
    }
    function buildIndex() {
      const parts = [], blocked = [];
      let text = '';
      function visit(node) {
        if (node.nodeType === Node.ELEMENT_NODE && node.matches(excludedSelector)) {
          blocked.push(node);
          text += barrier;
          return;
        }
        if (node.nodeType === Node.TEXT_NODE && node.data.length) {
          parts.push({node, start:text.length, end:text.length + node.data.length});
          text += node.data;
          return;
        }
        node.childNodes.forEach(visit);
      }
      root.childNodes.forEach(visit);
      return {text, parts, blocked, fingerprint:fingerprint(text)};
    }
    function contextAt(start, end) {
      return {prefix:index.text.slice(Math.max(0, start - contextSize), start), suffix:index.text.slice(end, end + contextSize)};
    }
    function rangeAt(start, end) {
      if (start < 0 || end <= start || end > index.text.length || index.text.slice(start,end).includes(barrier)) return null;
      const first = index.parts.find(part => start >= part.start && start < part.end);
      const last = index.parts.find(part => end > part.start && end <= part.end);
      if (!first || !last) return null;
      const range = document.createRange();
      range.setStart(first.node, start - first.start);
      range.setEnd(last.node, end - last.start);
      return range;
    }
    function matchesContext(anchor, start) {
      const end = start + anchor.exact.length;
      return index.text.slice(Math.max(0, start - anchor.prefix.length), start) === anchor.prefix && index.text.slice(end, end + anchor.suffix.length) === anchor.suffix;
    }
    function resolve(anchor) {
      const exact = anchor.exact;
      if (anchor.source_fingerprint === index.fingerprint && index.text.slice(anchor.start, anchor.end) === exact && matchesContext(anchor, anchor.start)) {
        const range = rangeAt(anchor.start, anchor.end);
        if (range) return {range, start:anchor.start};
      }
      const candidates = [];
      let position = index.text.indexOf(exact);
      while (position !== -1) {
        if (rangeAt(position, position + exact.length)) candidates.push(position);
        position = index.text.indexOf(exact, position + 1);
      }
      if (candidates.length) {
        // A formerly ambiguous quote remains ambiguous after edits, even if one copy disappears.
        if (!anchor.context_unique) return {reason:'原标注的前后文曾对应多个相同片段；正文已修订，无法确认原位置。笔记已保留。'};
        const contextual = candidates.filter(start => matchesContext(anchor, start));
        if (contextual.length === 1) return {range:rangeAt(contextual[0], contextual[0] + exact.length), start:contextual[0]};
        return {reason:candidates.length > 1 ? '正文中有多个相同片段，现有前后文无法确定原位置。笔记已保留。' : '原文片段仍存在，但前后文已改变，无法确认原位置。笔记已保留。'};
      }
      return {reason:'原文片段已修改或移除，暂时无法定位。笔记已保留。'};
    }
    function currentSelection(reportError = false) {
      const selection = window.getSelection();
      if (!selection || selection.isCollapsed || !selection.rangeCount) return null;
      if (selection.rangeCount !== 1) {
        if (reportError) announce('请只选择一段连续正文，再添加标注。');
        return null;
      }
      const range = selection.getRangeAt(0).cloneRange();
      if (!root.contains(range.startContainer) || !root.contains(range.endContainer)) {
        if (reportError || root.contains(range.commonAncestorContainer) || range.intersectsNode(root)) announce('标注只支持课程正文；请把选择范围完整放在正文内。');
        return null;
      }
      index = buildIndex();
      if (excluded(range.startContainer) || excluded(range.endContainer) || index.blocked.some(node => range.intersectsNode(node))) {
        announce('所选内容跨过公式、图形、表单、自测或动态演示。请分段选择这些区域之外的静态正文。');
        return null;
      }
      const selectedParts = index.parts.filter(part => range.intersectsNode(part.node));
      if (!selectedParts.length) return null;
      const first = selectedParts[0], last = selectedParts[selectedParts.length - 1];
      let start = first.start + (range.startContainer === first.node ? range.startOffset : 0);
      let end = last.start + (range.endContainer === last.node ? range.endOffset : last.node.data.length);
      const selected = index.text.slice(start, end);
      start += selected.length - selected.trimStart().length;
      end -= selected.length - selected.trimEnd().length;
      const exact = index.text.slice(start, end);
      if (!exact || exact.includes(barrier)) return null;
      if (exact.length > 20000) { announce('这段选择太长；请分成较短的片段添加标注。'); return null; }
      const cleanRange = rangeAt(start,end);
      if (!cleanRange) return null;
      const anchor = {exact, ...contextAt(start,end), start, end, source_fingerprint:index.fingerprint};
      let matchingContexts = 0, position = index.text.indexOf(exact);
      while (position !== -1) {
        if (matchesContext(anchor,position) && rangeAt(position,position + exact.length)) matchingContexts += 1;
        position = index.text.indexOf(exact,position + 1);
      }
      anchor.context_unique = matchingContexts === 1;
      return {anchor, range:cleanRange};
    }
    function positionToolbar() {
      if (!pending || toolbar.hidden) return;
      const rects = Array.from(pending.range.getClientRects()).filter(rect => rect.width || rect.height);
      const rect = rects[rects.length - 1] || pending.range.getBoundingClientRect();
      const box = toolbar.getBoundingClientRect();
      const left = Math.min(Math.max(8, rect.left), Math.max(8, innerWidth - box.width - 8));
      const below = rect.bottom + 8;
      const top = below + box.height <= innerHeight - 8 ? below : Math.max(8, rect.top - box.height - 8);
      toolbar.style.left = left + 'px';
      toolbar.style.top = Math.min(top, Math.max(8, innerHeight - box.height - 8)) + 'px';
    }
    function selectionChanged() {
      if (Date.now() < suppressSelectionUntil || dialog.open) return;
      if (toolbar.contains(document.activeElement)) return;
      pending = currentSelection();
      toolbar.hidden = !pending;
      if (pending) positionToolbar();
    }
    function updateStorageStatus() {
      if (persistenceProblem) {
        storageStatus.dataset.warning = 'true';
        storageStatus.textContent = persistenceProblem + ' 本次会话仍可使用标注；关闭前请导出 JSON 备份。';
      } else {
        storageStatus.dataset.warning = String(location.protocol === 'file:');
        storageStatus.textContent = location.protocol === 'file:' ? '当前浏览器允许本地保存。直接打开的 HTML 文件，其存储行为因浏览器和文件路径而异；移动文件、换浏览器或清除数据后可能无法读到笔记，请定期导出 JSON 备份。' : '笔记保存在当前浏览器中，按本页固定标识区分。换浏览器或清除浏览器数据前，请导出 JSON 备份。';
      }
    }
    function backup() { return {schema, lesson_id:lessonId, annotations:copy(records), exported_at:new Date().toISOString()}; }
    function validBackup(data) {
      if (!data || data.schema !== schema || data.lesson_id !== lessonId || !Array.isArray(data.annotations)) throw new Error('备份格式不正确，或备份不属于本课程页面。');
      if (data.annotations.length > 1000) throw new Error('备份超过 1000 条标注，请拆分后再导入。');
      const seen = new Set();
      return data.annotations.map(item => {
        const a = item && item.anchor;
        if (!item || typeof item.id !== 'string' || !item.id || item.id.length > 200 || seen.has(item.id) || typeof item.kind !== 'string' || !Object.hasOwn(styleNames,item.kind) || typeof item.note !== 'string' || item.note.length > 10000 || !a || typeof a.exact !== 'string' || !a.exact.trim() || a.exact.length > 20000 || a.exact.includes(barrier) || typeof a.prefix !== 'string' || a.prefix.length > 120 || typeof a.suffix !== 'string' || a.suffix.length > 120 || !Number.isSafeInteger(a.start) || !Number.isSafeInteger(a.end) || a.start < 0 || a.end - a.start !== a.exact.length || typeof a.source_fingerprint !== 'string' || a.source_fingerprint.length > 160 || (a.context_unique !== undefined && typeof a.context_unique !== 'boolean')) throw new Error('备份包含无效或重复的标注记录，尚未导入任何内容。');
        seen.add(item.id);
        return {id:item.id, kind:item.kind, note:item.note, anchor:{exact:a.exact,prefix:a.prefix,suffix:a.suffix,start:a.start,end:a.end,source_fingerprint:a.source_fingerprint,context_unique:a.context_unique === true}, created_at:typeof item.created_at === 'string' ? item.created_at.slice(0,40) : '', updated_at:typeof item.updated_at === 'string' ? item.updated_at.slice(0,40) : ''};
      });
    }
    function persist() {
      if (!canPersist) return;
      try { storage.setItem(storageKey, JSON.stringify(backup())); }
      catch (error) {
        canPersist = false;
        persistenceProblem = '浏览器保存失败（' + (error.name || '存储错误') + '），本次更改尚未持久保存。';
        updateStorageStatus();
        announce(persistenceProblem + ' 请导出 JSON 备份。');
      }
    }
    function load() {
      if (!lessonId) {
        persistenceProblem = '页面缺少固定 lesson_id，无法安全区分课程笔记。';
        updateStorageStatus();
        return;
      }
      try { storage = window.localStorage; }
      catch (error) { persistenceProblem = '浏览器不允许访问本地存储（' + (error.name || '访问错误') + '）。'; }
      if (storage) {
        let saved = null;
        try {
          saved = storage.getItem(storageKey);
        } catch (error) { persistenceProblem = '浏览器不允许读取本地存储（' + (error.name || '访问错误') + '）。'; }
        if (saved) {
          try { records = validBackup(JSON.parse(saved)); }
          catch (error) { persistenceProblem = '已有本地笔记数据损坏或格式不兼容，原存储内容未被覆盖。'; }
        }
        if (!persistenceProblem) {
          try {
            const probeKey = storageKey + ':probe:' + uid();
            storage.setItem(probeKey,'1');
            storage.removeItem(probeKey);
            canPersist = true;
          } catch (error) { persistenceProblem = '浏览器不允许保存笔记（' + (error.name || '存储错误') + '）。'; }
        }
      }
      updateStorageStatus();
    }
    function render() {
      index = buildIndex();
      resolutions = new Map(records.map(record => [record.id, resolve(record.anchor)]));
      if (supportsHighlights) {
        [['highlight','lesson-note-highlight'],['underline','lesson-note-underline'],['note','lesson-note-comment']].forEach(([kind,name]) => {
          const ranges = records.filter(record => record.kind === kind).map(record => resolutions.get(record.id).range).filter(Boolean);
          CSS.highlights.set(name,new Highlight(...ranges));
        });
      }
      list.replaceChildren();
      byId('annotation-empty').hidden = records.length > 0;
      records.forEach(record => {
        const item = document.createElement('li');
        item.dataset.annotationId = record.id;
        const meta = document.createElement('p');
        meta.className = 'annotation-item-meta';
        meta.textContent = styleNames[record.kind];
        const quote = document.createElement('blockquote');
        quote.textContent = record.anchor.exact;
        item.append(meta,quote);
        const note = document.createElement('p');
        note.className = 'annotation-item-note';
        note.textContent = record.note || '未填写评注。';
        item.append(note);
        const location = resolutions.get(record.id);
        if (!location.range) {
          const status = document.createElement('p');
          status.className = 'annotation-item-unlocated';
          status.textContent = '未定位：' + location.reason;
          item.append(status);
        }
        const actions = document.createElement('div');
        actions.className = 'annotation-item-actions';
        [['locate','定位原文'],['edit','编辑评注'],['delete','删除']].forEach(([action,label]) => {
          const button = document.createElement('button');
          button.type = 'button';
          button.dataset.annotationItemAction = action;
          button.textContent = label;
          button.disabled = action === 'locate' && !location.range;
          actions.append(button);
        });
        item.append(actions);
        list.append(item);
      });
      opener.textContent = '正文笔记（' + records.length + '）';
    }
    function openDialog() {
      toolbar.hidden = true;
      render();
      if (!dialog.open) dialog.showModal();
    }
    function resetEditor() {
      editing = null;
      editor.hidden = true;
      byId('annotation-editor-error').hidden = true;
      noteInput.value = '';
    }
    function openEditor(record, anchor) {
      editing = {id:record ? record.id : null, anchor:copy(record ? record.anchor : anchor)};
      byId('annotation-editor-title').textContent = record ? '编辑评注' : '添加评注';
      byId('annotation-editor-quote').textContent = editing.anchor.exact;
      noteInput.value = record ? record.note : '';
      kindInput.value = record ? record.kind : 'note';
      byId('annotation-editor-error').hidden = true;
      editor.hidden = false;
      openDialog();
      noteInput.focus();
    }
    function add(kind) {
      // Recheck the live DOM, including exclusions that changed after the toolbar appeared.
      const selection = currentSelection(true);
      if (!selection) { pending = null; toolbar.hidden = true; return; }
      if (records.length >= 1000) { announce('本页已达到 1000 条标注，请先导出备份并整理笔记。'); return; }
      if (kind === 'note') { openEditor(null,selection.anchor); return; }
      const now = new Date().toISOString();
      records.push({id:uid(),kind,note:'',anchor:copy(selection.anchor),created_at:now,updated_at:now});
      persist();
      render();
      toolbar.hidden = true;
      pending = null;
      suppressSelectionUntil = Date.now() + 200;
      window.getSelection().removeAllRanges();
      announce('已添加' + styleNames[kind] + '；可在“正文笔记”中补充评注。' + (canPersist ? '' : ' 请在关闭前导出备份。'));
    }
    function locate(id) {
      render();
      const location = resolutions.get(id);
      if (!location || !location.range) { announce('这条笔记暂时无法定位；原文片段和评注仍已保留。'); return; }
      dialog.close();
      resetEditor();
      suppressSelectionUntil = Date.now() + 800;
      pending = null;
      toolbar.hidden = true;
      const range = location.range;
      const selection = window.getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
      const element = range.startContainer.parentElement;
      let ancestor = element;
      while (ancestor && ancestor !== root) {
        if (ancestor.tagName === 'DETAILS') ancestor.setAttribute('open','');
        ancestor = ancestor.parentElement;
      }
      element.scrollIntoView({block:'center',behavior:'instant'});
      if (supportsHighlights) {
        const flash = new Highlight(range);
        flash.priority = 2;
        CSS.highlights.set('lesson-note-focus',flash);
        setTimeout(() => { CSS.highlights.delete('lesson-note-focus'); },1800);
      }
      announce('已定位原文。');
    }
    function importData(data) {
      if (typeof data === 'string') data = JSON.parse(data);
      const imported = validBackup(data);
      const next = records.slice();
      let added = 0, skipped = 0;
      imported.forEach(record => {
        const existing = next.find(item => item.id === record.id);
        if (existing && existing.kind === record.kind && existing.note === record.note && JSON.stringify(existing.anchor) === JSON.stringify(record.anchor)) { skipped += 1; return; }
        if (existing) record.id = uid();
        next.push(record);
        added += 1;
      });
      if (next.length > 1000) throw new Error('合并后超过 1000 条标注，尚未导入。');
      records = next;
      persist();
      render();
      const unlocated = records.filter(record => !resolutions.get(record.id).range).length;
      announce('已导入 ' + added + ' 条，略过 ' + skipped + ' 条相同标注；现有标注已保留。' + (unlocated ? ' 有 ' + unlocated + ' 条暂未定位。' : ''));
      return {added,skipped,unlocated};
    }

    opener = byId('annotation-open') || document.createElement('button');
    opener.id = 'annotation-open';
    opener.type = 'button';
    opener.className = 'annotation-open';
    opener.setAttribute('aria-haspopup','dialog');
    opener.setAttribute('aria-controls','annotation-dialog');
    if (!opener.isConnected) (document.querySelector('.sidebar') || root.parentElement).append(opener);
    const hint = document.createElement('p');
    hint.className = 'annotation-sidebar-help';
    hint.textContent = '拖选正文添加标注；笔记可导出备份。';
    opener.after(hint);
    opener.addEventListener('click',() => { resetEditor(); openDialog(); });
    byId('annotation-close').addEventListener('click',() => dialog.close());
    dialog.addEventListener('close',() => { resetEditor(); pending = null; toolbar.hidden = true; });
    toolbar.addEventListener('pointerdown',event => { if (event.target.closest('button')) event.preventDefault(); });
    toolbar.addEventListener('click',event => { const button = event.target.closest('[data-annotation-action]'); if (button) add(button.dataset.annotationAction); });
    document.addEventListener('selectionchange',selectionChanged);
    document.addEventListener('pointerup',() => { setTimeout(selectionChanged,0); });
    document.addEventListener('keyup',event => { if (event.key.startsWith('Arrow') || event.key === 'Shift') selectionChanged(); });
    window.addEventListener('resize',positionToolbar);
    window.addEventListener('scroll',positionToolbar,{passive:true});
    document.addEventListener('keydown',event => {
      if (event.key === 'Escape' && !dialog.open) { toolbar.hidden = true; pending = null; return; }
      const active = document.activeElement;
      if (dialog.open || active.matches('input,textarea,select,[contenteditable="true"]') || !event.altKey || !event.shiftKey || event.ctrlKey || event.metaKey) return;
      const kind = {KeyH:'highlight',KeyU:'underline',KeyN:'note'}[event.code];
      if (kind) { event.preventDefault(); pending = currentSelection(true); add(kind); }
    });
    byId('annotation-cancel').addEventListener('click',resetEditor);
    byId('annotation-save').addEventListener('click',() => {
      if (!editing) return;
      const note = noteInput.value.trim();
      const kind = kindInput.value;
      if (kind === 'note' && !note) {
        const error = byId('annotation-editor-error');
        error.textContent = '请填写评注，或改选高亮 / 下划线样式。';
        error.hidden = false;
        noteInput.focus();
        return;
      }
      const now = new Date().toISOString();
      const existing = editing.id && records.find(record => record.id === editing.id);
      if (!existing && records.length >= 1000) {
        const error = byId('annotation-editor-error');
        error.textContent = '本页已达到 1000 条标注，请先导出备份并整理笔记；这条新评注尚未保存。';
        error.hidden = false;
        return;
      }
      if (existing) { existing.note = note; existing.kind = kind; existing.updated_at = now; }
      else records.push({id:uid(),kind,note,anchor:copy(editing.anchor),created_at:now,updated_at:now});
      persist();
      render();
      resetEditor();
      byId('annotation-close').focus();
      announce('评注已保存。' + (canPersist ? '' : ' 请在关闭前导出备份。'));
    });
    list.addEventListener('click',event => {
      const button = event.target.closest('[data-annotation-item-action]');
      if (!button) return;
      const id = button.closest('[data-annotation-id]').dataset.annotationId;
      const record = records.find(item => item.id === id);
      if (!record) return;
      if (button.dataset.annotationItemAction === 'locate') locate(id);
      if (button.dataset.annotationItemAction === 'edit') openEditor(record);
      if (button.dataset.annotationItemAction === 'delete') {
        records = records.filter(item => item.id !== id);
        if (editing && editing.id === id) resetEditor();
        persist();
        render();
        byId('annotation-close').focus();
        announce('已删除这条标注。');
      }
    });
    byId('annotation-export').addEventListener('click',() => {
      const blob = new Blob([JSON.stringify(backup(),null,2)],{type:'application/json;charset=utf-8'});
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = (lessonId || 'lesson').replace(/[^a-zA-Z0-9_\-\u4e00-\u9fff]/g,'_').slice(0,80) + '-notes.json';
      (dialog.open ? dialog : document.body).append(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url),1000);
      announce('已生成 JSON 备份，请保留下载文件。');
    });
    byId('annotation-import').addEventListener('click',() => byId('annotation-import-file').click());
    byId('annotation-import-file').addEventListener('change',async event => {
      const file = event.target.files[0];
      event.target.value = '';
      if (!file) return;
      // Covers the worst-case escaped JSON of 1000 valid records, including long notes.
      if (file.size > 256 * 1024 * 1024) { announce('文件超过 256 MB，已超出本工具的合法备份容量；请检查是否选择了正确的 JSON 文件。'); return; }
      try { importData(await file.text()); }
      catch (error) { announce('导入失败：' + (error instanceof SyntaxError ? '文件不是有效的 JSON。' : error.message)); }
    });
    if (!supportsHighlights) {
      const compatibility = byId('annotation-compatibility');
      compatibility.textContent = '当前浏览器不支持正文范围着色。笔记仍可保存、编辑和备份；“定位原文”会选中对应文字。使用新版浏览器可看到高亮与下划线。';
      compatibility.hidden = false;
      compatibility.dataset.warning = 'true';
    }
    load();
    render();
    const observer = new MutationObserver(changes => {
      if (!changes.some(change => change.type === 'attributes' || !excluded(change.target))) return;
      clearTimeout(refreshTimer);
      refreshTimer = setTimeout(() => { pending = null; toolbar.hidden = true; render(); },100);
    });
    observer.observe(root,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:['class','hidden','data-no-annotate','aria-hidden','contenteditable']});
    window.courseAnnotations = Object.freeze({
      exportData:backup,
      importData,
      getAll:() => records.map(record => ({...copy(record),located:!!resolutions.get(record.id)?.range,locationIssue:resolutions.get(record.id)?.reason || ''})),
      refresh:() => { render(); return records.length; }
    });
    if (persistenceProblem) announce(persistenceProblem + ' 本次会话可用；关闭前请导出备份。');
  }
  if (document.getElementById('lesson-content')) init();
  else document.addEventListener('DOMContentLoaded',init,{once:true});
})();
