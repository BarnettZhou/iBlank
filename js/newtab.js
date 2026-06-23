(() => {
  const GRID_COLS = 6;
  const MIN_WIDGET_WIDTH = 1;
  const MIN_WIDGET_HEIGHT = 1;

  let state = {
    widgets: []
  };

  let settings = {
    linkTarget: '_self',
    theme: 'dark',
    wallpaper: null
  };

  let isEditMode = false;

  let draggedWidget = null;
  let dragStartPos = { col: 0, row: 0 };
  let dragOffset = { x: 0, y: 0 };
  let dragPlaceholder = null;
  let resizingWidget = null;
  let resizeStartPos = { x: 0, y: 0, w: 0, h: 0 };
  let currentWidgetConfig = null;
  let contextMenu = null;

  // DOM 引用
  const gridContainer = document.getElementById('gridContainer');
  const appContainer = document.querySelector('.app');
  const editModeBtn = document.getElementById('editModeBtn');
  const addWidgetBtn = document.getElementById('addWidgetBtn');
  const settingsBtn = document.getElementById('settingsBtn');
  const widgetModal = document.getElementById('widgetModal');
  const configModal = document.getElementById('configModal');
  const configContent = document.getElementById('configContent');
  const configTitle = document.getElementById('configTitle');
  const settingsModal = document.getElementById('settingsModal');
  const settingsWallpaperInput = document.getElementById('settingsWallpaperInput');
  const wallpaperPreview = document.getElementById('wallpaperPreview');
  const removeWallpaperBtn = document.getElementById('removeWallpaperBtn');
  const settingsLinkTarget = document.getElementById('settingsLinkTarget');
  const settingsTheme = document.getElementById('settingsTheme');
  const settingsCloseBtn = document.getElementById('settingsCloseBtn');

  // 工具函数
  const uid = () => Math.random().toString(36).slice(2) + Date.now().toString(36);

  const escapeHtml = (str) => {
    if (str == null) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  };

  // 栅格尺寸计算（单元格为正方形，高度 = 宽度）
  const getCellMetrics = () => {
    const gap = 16;
    const containerWidth = Math.max(gridContainer.offsetWidth, GRID_COLS * 40);
    const cellWidth = Math.max((containerWidth - (GRID_COLS - 1) * gap) / GRID_COLS, 40);
    return { cellWidth, cellHeight: cellWidth, gap };
  };

  // 拖拽占位框
  const showDragPlaceholder = (col, row, width, height, isValid) => {
    if (!dragPlaceholder) {
      dragPlaceholder = document.createElement('div');
      dragPlaceholder.className = 'drag-placeholder';
      gridContainer.appendChild(dragPlaceholder);
    }

    const { cellWidth, cellHeight, gap } = getCellMetrics();
    dragPlaceholder.classList.toggle('invalid', !isValid);
    dragPlaceholder.style.left = `${col * (cellWidth + gap)}px`;
    dragPlaceholder.style.top = `${row * (cellHeight + gap)}px`;
    dragPlaceholder.style.width = `${width * cellWidth + (width - 1) * gap}px`;
    dragPlaceholder.style.height = `${height * cellHeight + (height - 1) * gap}px`;
  };

  const hideDragPlaceholder = () => {
    if (dragPlaceholder) {
      dragPlaceholder.remove();
      dragPlaceholder = null;
    }
  };

  // 状态管理
  const loadState = async () => {
    if (typeof chrome !== 'undefined' && chrome.storage) {
      const res = await chrome.storage.sync.get('iblank_widgets');
      if (res.iblank_widgets) state = res.iblank_widgets;
    } else {
      const raw = localStorage.getItem('iblank_widgets');
      if (raw) state = JSON.parse(raw);
    }
  };

  const saveState = async () => {
    if (typeof chrome !== 'undefined' && chrome.storage) {
      await chrome.storage.sync.set({ iblank_widgets: state });
    } else {
      localStorage.setItem('iblank_widgets', JSON.stringify(state));
    }
  };

  // 设置管理
  const loadSettings = async () => {
    let raw = null;
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      const res = await chrome.storage.local.get('iblank_settings');
      raw = res.iblank_settings;
    } else {
      raw = localStorage.getItem('iblank_settings');
    }
    if (raw) {
      try {
        const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
        settings = { ...settings, ...parsed };
      } catch (e) {
        console.error('Failed to load settings', e);
      }
    }
  };

  const saveSettings = async () => {
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      await chrome.storage.local.set({ iblank_settings: settings });
    } else {
      localStorage.setItem('iblank_settings', JSON.stringify(settings));
    }
  };

  const applyTheme = () => {
    document.documentElement.setAttribute('data-theme', settings.theme);
  };

  const applyWallpaper = (dataUrl) => {
    if (dataUrl) {
      document.body.style.backgroundImage = `url(${dataUrl})`;
      document.body.style.backgroundSize = 'cover';
      document.body.style.backgroundPosition = 'center';
      document.body.style.backgroundRepeat = 'no-repeat';
      document.body.style.backgroundAttachment = 'fixed';
    } else {
      document.body.style.backgroundImage = '';
      document.body.style.backgroundSize = '';
      document.body.style.backgroundPosition = '';
      document.body.style.backgroundRepeat = '';
      document.body.style.backgroundAttachment = '';
    }
  };

  const updateSettingsUI = () => {
    settingsLinkTarget.value = settings.linkTarget;
    settingsTheme.value = settings.theme;
  };

  const updateWallpaperPreview = (dataUrl) => {
    if (dataUrl) {
      wallpaperPreview.style.backgroundImage = `url(${dataUrl})`;
      wallpaperPreview.classList.add('has-image');
      removeWallpaperBtn.style.display = 'block';
    } else {
      wallpaperPreview.style.backgroundImage = '';
      wallpaperPreview.classList.remove('has-image');
      removeWallpaperBtn.style.display = 'none';
    }
  };

  // 寻找空闲位置
  const findFreePosition = (w, h) => {
    const occupied = new Map();

    state.widgets.forEach(widget => {
      for (let row = widget.row; row < widget.row + widget.height; row++) {
        for (let col = widget.col; col < widget.col + widget.width; col++) {
          occupied.set(`${row},${col}`, true);
        }
      }
    });

    const maxRow = Math.max(...state.widgets.map(w => w.row + w.height), 0);
    const searchLimit = maxRow + 10;

    for (let row = 0; row < searchLimit; row++) {
      for (let col = 0; col <= GRID_COLS - w; col++) {
        let free = true;
        for (let r = row; r < row + h && free; r++) {
          for (let c = col; c < col + w; c++) {
            if (occupied.has(`${r},${c}`)) {
              free = false;
              break;
            }
          }
        }
        if (free) return { row, col };
      }
    }

    return { row: maxRow, col: 0 };
  };

  // 检查位置是否可用
  const canPlaceWidget = (widgetId, col, row, width, height) => {
    if (col < 0 || col + width > GRID_COLS || row < 0) return false;

    for (const widget of state.widgets) {
      if (widget.id === widgetId) continue;

      if (
        col < widget.col + widget.width &&
        col + width > widget.col &&
        row < widget.row + widget.height &&
        row + height > widget.row
      ) {
        return false;
      }
    }
    return true;
  };

  // Modal 管理
  const openModal = (modal) => {
    modal.setAttribute('aria-hidden', 'false');
  };

  const closeModal = (modal) => {
    modal.setAttribute('aria-hidden', 'true');
  };

  // 右键菜单
  const closeContextMenu = () => {
    if (contextMenu) {
      contextMenu.remove();
      contextMenu = null;
    }
  };

  const showContextMenu = (x, y, items, title) => {
    closeContextMenu();

    const menu = document.createElement('div');
    menu.className = 'context-menu';
    menu.style.left = `${x}px`;
    menu.style.top = `${y}px`;

    if (title) {
      const titleEl = document.createElement('div');
      titleEl.className = 'context-menu-title';
      titleEl.textContent = title;
      menu.appendChild(titleEl);
    }

    items.forEach(item => {
      if (item.divider) {
        const divider = document.createElement('div');
        divider.className = 'context-menu-divider';
        menu.appendChild(divider);
      } else {
        const menuItem = document.createElement('div');
        menuItem.className = 'context-menu-item' + (item.danger ? ' danger' : '');

        const iconSpan = document.createElement('span');
        iconSpan.textContent = item.icon || '';

        const labelSpan = document.createElement('span');
        labelSpan.textContent = item.label;

        menuItem.appendChild(iconSpan);
        menuItem.appendChild(labelSpan);

        menuItem.addEventListener('click', (e) => {
          e.stopPropagation();
          e.preventDefault();
          closeContextMenu();
          // 延迟执行action，确保菜单先关闭
          setTimeout(() => {
            item.action();
          }, 0);
        });

        menu.appendChild(menuItem);
      }
    });

    document.body.appendChild(menu);
    contextMenu = menu;

    // 确保菜单在屏幕内
    setTimeout(() => {
      const rect = menu.getBoundingClientRect();
      if (rect.right > window.innerWidth) {
        menu.style.left = `${x - rect.width}px`;
      }
      if (rect.bottom > window.innerHeight) {
        menu.style.top = `${y - rect.height}px`;
      }
    }, 0);
  };

  // 组件类型定义
  const widgetTypes = {
    webpage: {
      name: '网页',
      icon: '🔗',
      defaultWidth: 1,
      defaultHeight: 1,
      render: (widget) => renderWebpageWidget(widget),
      config: (widget, onSave) => renderWebpageConfig(widget, onSave)
    },
    clock: {
      name: '时钟',
      icon: '🕐',
      defaultWidth: 2,
      defaultHeight: 1,
      render: (widget) => renderClockWidget(widget),
      config: null
    },
    countdown: {
      name: '倒计时',
      icon: '⏱️',
      defaultWidth: 2,
      defaultHeight: 1,
      render: (widget) => renderCountdownWidget(widget),
      config: (widget, onSave) => renderCountdownConfig(widget, onSave)
    },
    note: {
      name: '便签',
      icon: '📝',
      defaultWidth: 2,
      defaultHeight: 2,
      render: (widget) => renderNoteWidget(widget),
      config: null
    },
    bookmarks: {
      name: '收藏夹',
      icon: '📚',
      defaultWidth: 2,
      defaultHeight: 2,
      render: (widget) => renderBookmarksWidget(widget),
      config: (widget, onSave) => renderBookmarksConfig(widget, onSave)
    },
    calendar: {
      name: '日历',
      icon: '📅',
      defaultWidth: 2,
      defaultHeight: 2,
      render: (widget) => renderCalendarWidget(widget),
      config: null
    },
    weather: {
      name: '天气',
      icon: '🌤️',
      defaultWidth: 2,
      defaultHeight: 1,
      render: (widget) => renderWeatherWidget(widget),
      config: (widget, onSave) => renderWeatherConfig(widget, onSave)
    }
  };

  // 添加组件
  const addWidget = (type) => {
    const widgetType = widgetTypes[type];
    if (!widgetType) return;

    const { row, col } = findFreePosition(widgetType.defaultWidth, widgetType.defaultHeight);

    const widget = {
      id: uid(),
      type,
      col,
      row,
      width: widgetType.defaultWidth,
      height: widgetType.defaultHeight,
      data: {}
    };

    state.widgets.push(widget);
    saveState();
    render();
  };

  // 删除组件
  const deleteWidget = async (id) => {
    if (confirm('确定要删除这个组件吗？')) {
      state.widgets = state.widgets.filter(w => w.id !== id);
      await saveState();
      render();
    }
  };

  // 配置组件
  const configureWidget = (widget) => {
    const widgetType = widgetTypes[widget.type];
    if (!widgetType || !widgetType.config) return;

    currentWidgetConfig = widget;
    configTitle.textContent = `配置${widgetType.name}`;

    widgetType.config(widget, async (data) => {
      widget.data = { ...widget.data, ...data };
      await saveState();
      render();
      closeModal(configModal);
    });

    openModal(configModal);
  };

  // 渲染主界面
  const render = () => {
    gridContainer.innerHTML = '';

    const { cellHeight, gap } = getCellMetrics();
    const widgetMaxRow = Math.max(...state.widgets.map(w => w.row + w.height), 0);

    // 默认模式下不生成栅格单元格，仅保留必要高度容纳组件
    if (isEditMode) {
      const maxRow = Math.max(widgetMaxRow, 4);
      const totalCells = maxRow * GRID_COLS;
      for (let i = 0; i < totalCells; i++) {
        const cell = document.createElement('div');
        cell.className = 'grid-cell';
        gridContainer.appendChild(cell);
      }
      gridContainer.style.minHeight = '';
    } else {
      const neededHeight = widgetMaxRow > 0
        ? widgetMaxRow * (cellHeight + gap) - gap
        : 0;
      gridContainer.style.minHeight = `${neededHeight}px`;
    }

    state.widgets.forEach(widget => {
      const widgetEl = createWidgetElement(widget);
      gridContainer.appendChild(widgetEl);
    });

    // 更新定时器
    updateClocks();
    updateCountdowns();
  };

  // 创建组件元素
  const createWidgetElement = (widget) => {
    const widgetType = widgetTypes[widget.type];
    const el = document.createElement('div');
    el.className = 'widget';
    el.dataset.widgetId = widget.id;

    // 1x1的组件保持正方形
    if (widget.width === 1 && widget.height === 1) {
      el.classList.add('square');
    }

    // 设置位置和大小
    const { cellWidth, cellHeight, gap } = getCellMetrics();

    el.style.left = `${widget.col * (cellWidth + gap)}px`;
    el.style.top = `${widget.row * (cellHeight + gap)}px`;
    el.style.width = `${widget.width * cellWidth + (widget.width - 1) * gap}px`;
    el.style.height = `${widget.height * cellHeight + (widget.height - 1) * gap}px`;

    // 内容
    const content = document.createElement('div');
    content.className = 'widget-content';
    content.innerHTML = widgetType.render(widget);

    // 调整大小手柄
    const resizeHandle = document.createElement('div');
    resizeHandle.className = 'resize-handle';

    el.appendChild(content);
    el.appendChild(resizeHandle);

    // 拖拽移动事件
    el.addEventListener('mousedown', (e) => {
      // 非编辑模式下禁止拖拽
      if (!isEditMode) return;

      // 如果点击的是调整大小手柄或其他交互元素，不触发拖拽
      if (e.target.closest('.resize-handle') ||
          e.target.closest('textarea') ||
          e.target.closest('a') ||
          e.target.closest('button') ||
          e.target.closest('input')) {
        return;
      }

      e.preventDefault();
      const rect = el.getBoundingClientRect();
      draggedWidget = { widget, el };
      dragOffset = {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top
      };
      dragStartPos = {
        col: widget.col,
        row: widget.row
      };

      el.classList.add('dragging');
      el.style.cursor = 'grabbing';
      el.style.transition = 'none';

      document.addEventListener('mousemove', handleWidgetDragMove);
      document.addEventListener('mouseup', handleWidgetDragEnd);
    });

    // 右键菜单
    el.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      e.stopPropagation();

      const items = [];

      if (widgetType.config) {
        items.push({
          icon: '⚙️',
          label: '配置',
          action: () => configureWidget(widget)
        });
      }

      // 收藏夹特殊菜单
      if (widget.type === 'bookmarks') {
        items.push({
          icon: '➕',
          label: '添加书签',
          action: () => configureWidget(widget)
        });

        const layout = widget.data.layout || 'list';
        items.push({
          icon: layout === 'list' ? '🔲' : '📋',
          label: layout === 'list' ? '切换到图标布局' : '切换到列表布局',
          action: async () => {
            widget.data.layout = layout === 'list' ? 'grid' : 'list';
            await saveState();
            render();
          }
        });
      }

      if (items.length > 0) {
        items.push({ divider: true });
      }

      items.push({
        icon: '🗑️',
        label: '删除组件',
        danger: true,
        action: () => deleteWidget(widget.id)
      });

      showContextMenu(e.clientX, e.clientY, items, widgetType.icon + ' ' + widgetType.name);
    });

    resizeHandle.addEventListener('mousedown', (e) => {
      if (!isEditMode) return;
      e.preventDefault();
      e.stopPropagation();
      handleResizeStart(e, widget, el);
    });

    // 为便签添加保存功能
    if (widget.type === 'note') {
      const textarea = content.querySelector('.note-textarea');
      if (textarea) {
        textarea.value = widget.data.text || '';
        textarea.addEventListener('input', debounce(async (e) => {
          widget.data.text = e.target.value;
          await saveState();
        }, 500));
      }
    }

    return el;
  };

  // 拖拽移动处理
  const handleWidgetDragMove = (e) => {
    if (!draggedWidget) return;

    const { widget, el } = draggedWidget;
    const { cellWidth, cellHeight, gap } = getCellMetrics();
    const containerRect = gridContainer.getBoundingClientRect();

    // 组件跟随鼠标，保持按下时的相对偏移
    const mouseX = e.clientX - containerRect.left - dragOffset.x;
    const mouseY = e.clientY - containerRect.top - dragOffset.y;

    el.style.left = `${mouseX}px`;
    el.style.top = `${mouseY}px`;

    // 计算吸附的栅格坐标
    let newCol = Math.round(mouseX / (cellWidth + gap));
    let newRow = Math.round(mouseY / (cellHeight + gap));
    newCol = Math.max(0, Math.min(GRID_COLS - widget.width, newCol));
    newRow = Math.max(0, newRow);

    // 更新占位框
    const isValid = canPlaceWidget(widget.id, newCol, newRow, widget.width, widget.height);
    showDragPlaceholder(newCol, newRow, widget.width, widget.height, isValid);
  };

  const handleWidgetDragEnd = async (e) => {
    if (!draggedWidget) return;

    const { widget, el } = draggedWidget;
    const { cellWidth, cellHeight, gap } = getCellMetrics();
    const containerRect = gridContainer.getBoundingClientRect();

    const mouseX = e.clientX - containerRect.left - dragOffset.x;
    const mouseY = e.clientY - containerRect.top - dragOffset.y;

    let newCol = Math.round(mouseX / (cellWidth + gap));
    let newRow = Math.round(mouseY / (cellHeight + gap));
    newCol = Math.max(0, Math.min(GRID_COLS - widget.width, newCol));
    newRow = Math.max(0, newRow);

    const isValid = canPlaceWidget(widget.id, newCol, newRow, widget.width, widget.height);

    // 恢复过渡动画
    el.style.transition = '';

    if (isValid) {
      widget.col = newCol;
      widget.row = newRow;
      await saveState();

      el.classList.add('animating');
      el.style.left = `${newCol * (cellWidth + gap)}px`;
      el.style.top = `${newRow * (cellHeight + gap)}px`;
    } else {
      el.classList.add('animating');
      el.style.left = `${dragStartPos.col * (cellWidth + gap)}px`;
      el.style.top = `${dragStartPos.row * (cellHeight + gap)}px`;
    }

    const positionChanged = isValid && (newCol !== dragStartPos.col || newRow !== dragStartPos.row);

    setTimeout(() => {
      el.classList.remove('animating');
      // 如果移动到新行，需要重新生成栅格单元格以撑开容器
      if (positionChanged) {
        render();
      }
    }, 250);

    hideDragPlaceholder();

    el.classList.remove('dragging');
    el.style.cursor = '';
    el.style.opacity = '';
    el.style.borderColor = '';

    draggedWidget = null;

    document.removeEventListener('mousemove', handleWidgetDragMove);
    document.removeEventListener('mouseup', handleWidgetDragEnd);
  };

  // 调整大小处理
  const handleResizeStart = (e, widget, el) => {
    resizingWidget = { widget, el };
    resizeStartPos = {
      x: e.clientX,
      y: e.clientY,
      w: widget.width,
      h: widget.height
    };
    el.classList.add('resizing');

    document.addEventListener('mousemove', handleResizeMove);
    document.addEventListener('mouseup', handleResizeEnd);
  };

  const handleResizeMove = (e) => {
    if (!resizingWidget) return;

    const { widget, el } = resizingWidget;
    const { cellWidth, cellHeight, gap } = getCellMetrics();

    const deltaX = e.clientX - resizeStartPos.x;
    const deltaY = e.clientY - resizeStartPos.y;

    const newWidth = Math.max(MIN_WIDGET_WIDTH, Math.min(GRID_COLS - widget.col, resizeStartPos.w + Math.round(deltaX / (cellWidth + gap))));
    const newHeight = Math.max(MIN_WIDGET_HEIGHT, resizeStartPos.h + Math.round(deltaY / (cellHeight + gap)));

    // 移除过渡动画以实现实时跟随
    el.style.transition = 'none';

    if (canPlaceWidget(widget.id, widget.col, widget.row, newWidth, newHeight)) {
      el.style.width = `${newWidth * cellWidth + (newWidth - 1) * gap}px`;
      el.style.height = `${newHeight * cellHeight + (newHeight - 1) * gap}px`;
      el.style.opacity = '0.8';
      el.style.borderColor = 'var(--primary)';
    } else {
      el.style.opacity = '0.4';
      el.style.borderColor = '#ef4444';
    }
  };

  const handleResizeEnd = async (e) => {
    if (!resizingWidget) return;

    const { widget, el } = resizingWidget;
    const { cellWidth, cellHeight, gap } = getCellMetrics();

    const deltaX = e.clientX - resizeStartPos.x;
    const deltaY = e.clientY - resizeStartPos.y;

    const newWidth = Math.max(MIN_WIDGET_WIDTH, Math.min(GRID_COLS - widget.col, resizeStartPos.w + Math.round(deltaX / (cellWidth + gap))));
    const newHeight = Math.max(MIN_WIDGET_HEIGHT, resizeStartPos.h + Math.round(deltaY / (cellHeight + gap)));

    // 恢复过渡动画
    el.style.transition = '';

    if (canPlaceWidget(widget.id, widget.col, widget.row, newWidth, newHeight)) {
      widget.width = newWidth;
      widget.height = newHeight;
      await saveState();

      // 添加动画类
      el.classList.add('animating');
      el.style.width = `${newWidth * cellWidth + (newWidth - 1) * gap}px`;
      el.style.height = `${newHeight * cellHeight + (newHeight - 1) * gap}px`;

      setTimeout(() => {
        el.classList.remove('animating');
        render(); // 重新渲染以更新内容
      }, 250);
    } else {
      // 恢复原大小（带动画）
      el.classList.add('animating');
      el.style.width = `${resizeStartPos.w * cellWidth + (resizeStartPos.w - 1) * gap}px`;
      el.style.height = `${resizeStartPos.h * cellHeight + (resizeStartPos.h - 1) * gap}px`;

      setTimeout(() => {
        el.classList.remove('animating');
      }, 250);
    }

    el.classList.remove('resizing');
    el.style.opacity = '';
    el.style.borderColor = '';
    resizingWidget = null;

    document.removeEventListener('mousemove', handleResizeMove);
    document.removeEventListener('mouseup', handleResizeEnd);
  };

  // 防抖函数
  const debounce = (func, wait) => {
    let timeout;
    return function executedFunction(...args) {
      const later = () => {
        clearTimeout(timeout);
        func(...args);
      };
      clearTimeout(timeout);
      timeout = setTimeout(later, wait);
    };
  };

  // ========== 组件渲染函数 ==========

  // 网页组件
  const renderWebpageWidget = (widget) => {
    const name = widget.data.name || '未命名';
    const url = widget.data.url || '';
    const icon = widget.data.icon || '';

    if (!url) {
      return `
        <div class="empty-state">
          <div class="empty-icon">🔗</div>
          <div class="empty-text">右键配置网页</div>
        </div>
      `;
    }

    return `
      <div class="webpage-widget">
        <a href="${escapeHtml(url)}" class="webpage-link" target="${escapeHtml(settings.linkTarget)}">
          ${icon ? 
            `<img class="webpage-icon" src="${escapeHtml(icon)}" alt="" />` :
            `<div class="webpage-icon fallback">${escapeHtml(name[0] || '?')}</div>`
          }
          <div class="webpage-name">${escapeHtml(name)}</div>
        </a>
      </div>
    `;
  };

  const renderWebpageConfig = (widget, onSave) => {
    configContent.innerHTML = `
      <div class="config-form">
        <label>
          <span>名称</span>
          <input type="text" id="webpageName" value="${escapeHtml(widget.data.name || '')}" placeholder="例如：GitHub" />
        </label>
        <label>
          <span>地址</span>
          <input type="url" id="webpageUrl" value="${escapeHtml(widget.data.url || '')}" placeholder="https://github.com" />
        </label>
      </div>
    `;

    document.getElementById('configConfirmBtn').onclick = () => {
      const name = document.getElementById('webpageName').value.trim();
      const url = document.getElementById('webpageUrl').value.trim();

      if (!name || !url) return;

      const icon = `https://www.google.com/s2/favicons?domain=${encodeURIComponent(new URL(url).hostname)}&sz=128`;

      onSave({ name, url, icon });
    };
  };

  // 时钟组件
  const renderClockWidget = (widget) => {
    return `
      <div class="clock-widget">
        <div class="clock-time" data-clock="${widget.id}">00:00:00</div>
        <div class="clock-date" data-clock-date="${widget.id}">2024-01-01</div>
      </div>
    `;
  };

  const updateClocks = () => {
    document.querySelectorAll('[data-clock]').forEach(el => {
      const now = new Date();
      el.textContent = now.toLocaleTimeString('zh-CN', { hour12: false });
    });

    document.querySelectorAll('[data-clock-date]').forEach(el => {
      const now = new Date();
      el.textContent = now.toLocaleDateString('zh-CN', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        weekday: 'long'
      });
    });
  };

  setInterval(updateClocks, 1000);

  // 倒计时组件
  const renderCountdownWidget = (widget) => {
    const targetDate = widget.data.targetDate;
    const isDaily = widget.data.isDaily;

    if (!targetDate && !isDaily) {
      return `
        <div class="empty-state">
          <div class="empty-icon">⏱️</div>
          <div class="empty-text">右键配置倒计时</div>
        </div>
      `;
    }

    return `
      <div class="countdown-widget">
        <div class="countdown-label">${escapeHtml(widget.data.label || '倒计时')}</div>
        <div class="countdown-time" data-countdown="${widget.id}" data-target="${targetDate || ''}" data-daily="${isDaily ? 'true' : 'false'}" data-daily-time="${widget.data.dailyTime || ''}">--</div>
      </div>
    `;
  };

  const updateCountdowns = () => {
    document.querySelectorAll('[data-countdown]').forEach(el => {
      const now = new Date();
      const isDaily = el.dataset.daily === 'true';

      let target;
      if (isDaily) {
        // 每日倒计时
        const dailyTime = el.dataset.dailyTime;
        if (!dailyTime) return;

        const [hours, minutes] = dailyTime.split(':').map(Number);
        target = new Date();
        target.setHours(hours, minutes, 0, 0);

        // 如果今天的时间已过，设置为明天
        if (target <= now) {
          target.setDate(target.getDate() + 1);
        }
      } else {
        // 具体日期倒计时
        target = new Date(el.dataset.target);
      }

      const diff = target - now;

      if (diff <= 0 && !isDaily) {
        el.textContent = '已结束';
        el.classList.add('countdown-expired');
        return;
      }

      el.classList.remove('countdown-expired');

      const days = Math.floor(diff / (1000 * 60 * 60 * 24));
      const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((diff % (1000 * 60)) / 1000);

      if (isDaily && days === 0) {
        // 每日倒计时只显示时分秒
        el.textContent = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
      } else if (days === 0) {
        el.textContent = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
      } else {
        el.textContent = `${days}天 ${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
      }
    });
  };

  setInterval(updateCountdowns, 1000);

  const renderCountdownConfig = (widget, onSave) => {
    const isDaily = widget.data.isDaily || false;
    const targetDate = widget.data.targetDate || '';
    const dailyTime = widget.data.dailyTime || '';

    configContent.innerHTML = `
      <div class="config-form">
        <label>
          <span>标签</span>
          <input type="text" id="countdownLabel" value="${escapeHtml(widget.data.label || '')}" placeholder="例如：高考倒计时" />
        </label>
        <label>
          <span>倒计时类型</span>
          <select id="countdownType">
            <option value="specific" ${!isDaily ? 'selected' : ''}>具体日期时间</option>
            <option value="daily" ${isDaily ? 'selected' : ''}>每日倒计时</option>
          </select>
        </label>
        <label id="specificDateLabel" style="display: ${!isDaily ? 'block' : 'none'};">
          <span>目标日期时间</span>
          <input type="datetime-local" id="countdownTarget" value="${targetDate}" />
        </label>
        <label id="dailyTimeLabel" style="display: ${isDaily ? 'block' : 'none'};">
          <span>每日时间</span>
          <input type="time" id="dailyTime" value="${dailyTime}" />
        </label>
      </div>
    `;

    const typeSelect = document.getElementById('countdownType');
    const specificDateLabel = document.getElementById('specificDateLabel');
    const dailyTimeLabel = document.getElementById('dailyTimeLabel');

    typeSelect.addEventListener('change', () => {
      const isDaily = typeSelect.value === 'daily';
      specificDateLabel.style.display = isDaily ? 'none' : 'block';
      dailyTimeLabel.style.display = isDaily ? 'block' : 'none';
    });

    document.getElementById('configConfirmBtn').onclick = () => {
      const label = document.getElementById('countdownLabel').value;
      const type = document.getElementById('countdownType').value;
      const isDaily = type === 'daily';

      if (isDaily) {
        const dailyTime = document.getElementById('dailyTime').value;
        if (!dailyTime) {
          alert('请设置每日时间');
          return;
        }
        onSave({
          label,
          isDaily: true,
          dailyTime,
          targetDate: ''
        });
      } else {
        const targetDate = document.getElementById('countdownTarget').value;
        if (!targetDate) {
          alert('请设置目标日期时间');
          return;
        }
        onSave({
          label,
          isDaily: false,
          targetDate,
          dailyTime: ''
        });
      }
    };
  };

  // 便签组件
  const renderNoteWidget = (widget) => {
    return `<textarea class="note-textarea" placeholder="在这里输入笔记...">${escapeHtml(widget.data.text || '')}</textarea>`;
  };

  // 收藏夹组件
  const renderBookmarksWidget = (widget) => {
    const bookmarks = widget.data.bookmarks || [];
    const layout = widget.data.layout || 'list';

    if (bookmarks.length === 0) {
      return `
        <div class="empty-state">
          <div class="empty-icon">📚</div>
          <div class="empty-text">右键添加书签</div>
        </div>
      `;
    }

    return `
      <div class="bookmarks-widget">
        <div class="bookmarks-list ${layout === 'grid' ? 'grid-layout' : ''}">
          ${bookmarks.map((bookmark, idx) => `
            <div class="bookmark-item" data-url="${escapeHtml(bookmark.url)}" data-idx="${idx}">
              ${bookmark.icon ?
                `<img class="bookmark-icon" src="${escapeHtml(bookmark.icon)}" alt="" />` :
                `<div class="bookmark-icon fallback">${escapeHtml(bookmark.name[0] || '?')}</div>`
              }
              <span class="bookmark-name">${escapeHtml(bookmark.name)}</span>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  };

  const renderBookmarksConfig = (widget, onSave) => {
    configContent.innerHTML = `
      <div class="config-form">
        <label>
          <span>名称</span>
          <input type="text" id="bookmarkName" placeholder="例如：GitHub" />
        </label>
        <label>
          <span>地址</span>
          <input type="url" id="bookmarkUrl" placeholder="https://github.com" />
        </label>
      </div>
    `;

    document.getElementById('configConfirmBtn').onclick = () => {
      const name = document.getElementById('bookmarkName').value.trim();
      const url = document.getElementById('bookmarkUrl').value.trim();

      if (!name || !url) return;

      const bookmarks = widget.data.bookmarks || [];
      const icon = `https://www.google.com/s2/favicons?domain=${encodeURIComponent(new URL(url).hostname)}&sz=128`;

      bookmarks.push({ name, url, icon });
      onSave({ bookmarks });
    };
  };

  // 编辑书签配置
  const renderEditBookmarkConfig = (widget, bookmarkIdx, onSave) => {
    const bookmark = widget.data.bookmarks[bookmarkIdx];
    
    configContent.innerHTML = `
      <div class="config-form">
        <label>
          <span>名称</span>
          <input type="text" id="bookmarkName" value="${escapeHtml(bookmark.name)}" placeholder="例如：GitHub" />
        </label>
        <label>
          <span>地址</span>
          <input type="url" id="bookmarkUrl" value="${escapeHtml(bookmark.url)}" placeholder="https://github.com" />
        </label>
      </div>
    `;

    document.getElementById('configConfirmBtn').onclick = () => {
      const name = document.getElementById('bookmarkName').value.trim();
      const url = document.getElementById('bookmarkUrl').value.trim();

      if (!name || !url) return;

      const icon = `https://www.google.com/s2/favicons?domain=${encodeURIComponent(new URL(url).hostname)}&sz=128`;

      widget.data.bookmarks[bookmarkIdx] = { name, url, icon };
      onSave(widget.data);
    };
  };

  // 日历组件
  const renderCalendarWidget = (widget) => {
    const now = new Date();
    const year = widget.data.year || now.getFullYear();
    const month = widget.data.month !== undefined ? widget.data.month : now.getMonth();

    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const daysInMonth = lastDay.getDate();
    const startDay = firstDay.getDay();

    const monthNames = ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月'];

    let calendarHtml = `
      <div class="calendar-widget">
        <div class="calendar-header">
          <div class="calendar-month">${year}年 ${monthNames[month]}</div>
          <div class="calendar-nav">
            <button class="calendar-prev" data-widget="${widget.id}">‹</button>
            <button class="calendar-next" data-widget="${widget.id}">›</button>
          </div>
        </div>
        <div class="calendar-grid">
          <div class="calendar-day header">日</div>
          <div class="calendar-day header">一</div>
          <div class="calendar-day header">二</div>
          <div class="calendar-day header">三</div>
          <div class="calendar-day header">四</div>
          <div class="calendar-day header">五</div>
          <div class="calendar-day header">六</div>
    `;

    // 填充空白
    for (let i = 0; i < startDay; i++) {
      const prevMonthDay = new Date(year, month, 0 - (startDay - i - 1)).getDate();
      calendarHtml += `<div class="calendar-day other-month">${prevMonthDay}</div>`;
    }

    // 填充日期
    const today = new Date();
    for (let day = 1; day <= daysInMonth; day++) {
      const isToday = year === today.getFullYear() && month === today.getMonth() && day === today.getDate();
      calendarHtml += `<div class="calendar-day ${isToday ? 'today' : ''}">${day}</div>`;
    }

    // 填充下月开头
    const remainingCells = 42 - (startDay + daysInMonth);
    for (let i = 1; i <= remainingCells; i++) {
      calendarHtml += `<div class="calendar-day other-month">${i}</div>`;
    }

    calendarHtml += '</div></div>';

    return calendarHtml;
  };

  // 天气组件
  const renderWeatherWidget = (widget) => {
    const location = widget.data.location || '未设置';

    return `
      <div class="weather-widget">
        <div class="empty-state">
          <div class="empty-icon">🌤️</div>
          <div class="empty-text">天气组件（演示）<br/>${escapeHtml(location)}</div>
        </div>
      </div>
    `;
  };

  const renderWeatherConfig = (widget, onSave) => {
    configContent.innerHTML = `
      <div class="config-form">
        <label>
          <span>城市</span>
          <input type="text" id="weatherLocation" value="${escapeHtml(widget.data.location || '')}" placeholder="例如：北京" />
        </label>
      </div>
    `;

    document.getElementById('configConfirmBtn').onclick = () => {
      onSave({
        location: document.getElementById('weatherLocation').value
      });
    };
  };

  // ========== 事件监听 ==========

  // 编辑模式切换
  const setEditMode = (value) => {
    isEditMode = value;
    appContainer.classList.toggle('edit-mode', isEditMode);
    editModeBtn.querySelector('span').textContent = isEditMode ? '完成' : '编辑';
    render();
  };

  editModeBtn.addEventListener('click', () => {
    setEditMode(!isEditMode);
  });

  // 添加组件按钮
  addWidgetBtn.addEventListener('click', () => {
    openModal(widgetModal);
  });

  // 设置
  settingsBtn.addEventListener('click', () => {
    updateSettingsUI();
    updateWallpaperPreview(settings.wallpaper);
    openModal(settingsModal);
  });

  settingsWallpaperInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      const dataUrl = event.target.result;
      settings.wallpaper = dataUrl;
      await saveSettings();
      applyWallpaper(dataUrl);
      updateWallpaperPreview(dataUrl);
    };
    reader.readAsDataURL(file);
    settingsWallpaperInput.value = '';
  });

  removeWallpaperBtn.addEventListener('click', async () => {
    settings.wallpaper = null;
    await saveSettings();
    applyWallpaper(null);
    updateWallpaperPreview(null);
  });

  settingsLinkTarget.addEventListener('change', async (e) => {
    settings.linkTarget = e.target.value;
    await saveSettings();
    render();
  });

  settingsTheme.addEventListener('change', async (e) => {
    settings.theme = e.target.value;
    await saveSettings();
    applyTheme();
  });

  settingsCloseBtn.addEventListener('click', () => {
    closeModal(settingsModal);
  });

  // 组件类型选择
  document.querySelectorAll('.widget-type-card').forEach(card => {
    card.addEventListener('click', () => {
      const type = card.dataset.type;
      addWidget(type);
      closeModal(widgetModal);
    });
  });

  // Modal 关闭
  document.getElementById('widgetCancelBtn').addEventListener('click', () => {
    closeModal(widgetModal);
  });

  document.getElementById('configCancelBtn').addEventListener('click', () => {
    closeModal(configModal);
  });

  document.querySelectorAll('.modal-overlay').forEach(overlay => {
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) {
        closeModal(overlay.parentElement);
      }
    });
  });

  // 事件委托：收藏夹和日历操作
  gridContainer.addEventListener('click', async (e) => {
    // 书签点击
    if (e.target.closest('.bookmark-item') && !e.target.closest('.bookmark-action')) {
      const item = e.target.closest('.bookmark-item');
      const url = item.dataset.url;
      if (!url) return;
      if (settings.linkTarget === '_blank') {
        window.open(url, '_blank');
      } else {
        window.location.href = url;
      }
      return;
    }

    // 日历导航
    if (e.target.classList.contains('calendar-prev')) {
      const widgetId = e.target.dataset.widget;
      const widget = state.widgets.find(w => w.id === widgetId);
      if (widget) {
        const now = new Date();
        const year = widget.data.year || now.getFullYear();
        const month = widget.data.month !== undefined ? widget.data.month : now.getMonth();

        const newMonth = month === 0 ? 11 : month - 1;
        const newYear = month === 0 ? year - 1 : year;

        widget.data.year = newYear;
        widget.data.month = newMonth;
        await saveState();
        render();
      }
      return;
    }

    if (e.target.classList.contains('calendar-next')) {
      const widgetId = e.target.dataset.widget;
      const widget = state.widgets.find(w => w.id === widgetId);
      if (widget) {
        const now = new Date();
        const year = widget.data.year || now.getFullYear();
        const month = widget.data.month !== undefined ? widget.data.month : now.getMonth();

        const newMonth = month === 11 ? 0 : month + 1;
        const newYear = month === 11 ? year + 1 : year;

        widget.data.year = newYear;
        widget.data.month = newMonth;
        await saveState();
        render();
      }
      return;
    }
  });

  // 书签右键菜单
  gridContainer.addEventListener('contextmenu', (e) => {
    const bookmarkItem = e.target.closest('.bookmark-item');
    if (bookmarkItem) {
      e.preventDefault();
      e.stopPropagation();

      const widgetEl = bookmarkItem.closest('.widget');
      const widgetId = widgetEl.dataset.widgetId;
      const widget = state.widgets.find(w => w.id === widgetId);
      const idx = parseInt(bookmarkItem.dataset.idx);

      if (widget && widget.data.bookmarks && widget.data.bookmarks[idx]) {
        const bookmark = widget.data.bookmarks[idx];

        showContextMenu(e.clientX, e.clientY, [
          {
            icon: '✏️',
            label: '编辑书签',
            action: () => {
              currentWidgetConfig = widget;
              configTitle.textContent = '编辑书签';
              renderEditBookmarkConfig(widget, idx, async (data) => {
                await saveState();
                render();
                closeModal(configModal);
              });
              openModal(configModal);
            }
          },
          { divider: true },
          {
            icon: '🗑️',
            label: '删除书签',
            danger: true,
            action: async () => {
              if (confirm(`确定要删除"${bookmark.name}"吗？`)) {
                widget.data.bookmarks.splice(idx, 1);
                await saveState();
                render();
              }
            }
          }
        ], '📚 书签');
      }
    }
  });

  // 全局点击关闭右键菜单
  document.addEventListener('click', (e) => {
    // 如果点击的是右键菜单内部，不关闭
    if (contextMenu && contextMenu.contains(e.target)) {
      return;
    }
    closeContextMenu();
  });

  // 搜索表单
  document.getElementById('searchForm').addEventListener('submit', (e) => {
    const input = document.getElementById('searchInput');
    if (!input.value.trim()) {
      e.preventDefault();
    }
  });

  // 窗口大小变化时重排组件
  window.addEventListener('resize', debounce(() => {
    render();
  }, 150));

  // 初始化
  Promise.all([loadState(), loadSettings()]).then(() => {
    render();
    applyTheme();
    applyWallpaper(settings.wallpaper);
  });
})();
