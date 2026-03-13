/**
 * 键盘快捷键服务
 * 管理应用程序的键盘快捷键
 */

export interface KeyboardShortcut {
  key: string;
  ctrlKey?: boolean;
  altKey?: boolean;
  shiftKey?: boolean;
  metaKey?: boolean;
  description: string;
  action: () => void;
  preventDefault?: boolean;
}

export class KeyboardShortcutsService {
  private shortcuts: Map<string, KeyboardShortcut> = new Map();
  private isEnabled = true;

  constructor() {
    this.bindEvents();
  }

  /**
   * 注册快捷键
   */
  register(shortcut: KeyboardShortcut): void {
    const key = this.getShortcutKey(shortcut);
    this.shortcuts.set(key, shortcut);
  }

  /**
   * 注册多个快捷键
   */
  registerMultiple(shortcuts: KeyboardShortcut[]): void {
    shortcuts.forEach(shortcut => this.register(shortcut));
  }

  /**
   * 取消注册快捷键
   */
  unregister(shortcut: Partial<KeyboardShortcut>): void {
    const key = this.getShortcutKey(shortcut);
    this.shortcuts.delete(key);
  }

  /**
   * 启用快捷键
   */
  enable(): void {
    this.isEnabled = true;
  }

  /**
   * 禁用快捷键
   */
  disable(): void {
    this.isEnabled = false;
  }

  /**
   * 获取所有注册的快捷键
   */
  getShortcuts(): KeyboardShortcut[] {
    return Array.from(this.shortcuts.values());
  }

  /**
   * 清除所有快捷键
   */
  clear(): void {
    this.shortcuts.clear();
  }

  /**
   * 销毁服务
   */
  destroy(): void {
    this.clear();
    document.removeEventListener('keydown', this.handleKeyDown);
  }

  /**
   * 绑定键盘事件
   */
  private bindEvents(): void {
    document.addEventListener('keydown', this.handleKeyDown.bind(this));
  }

  /**
   * 处理键盘按下事件
   */
  private handleKeyDown(event: KeyboardEvent): void {
    if (!this.isEnabled) return;

    // 忽略在输入框中的按键
    const target = event.target as HTMLElement;
    if (this.isInputElement(target)) return;

    const shortcut = this.findMatchingShortcut(event);
    if (shortcut) {
      if (shortcut.preventDefault !== false) {
        event.preventDefault();
      }
      shortcut.action();
    }
  }

  /**
   * 检查是否是输入元素
   */
  private isInputElement(element: HTMLElement): boolean {
    const inputTags = ['INPUT', 'TEXTAREA', 'SELECT'];
    return inputTags.includes(element.tagName) || 
           element.contentEditable === 'true' ||
           element.closest('[contenteditable="true"]') !== null;
  }

  /**
   * 查找匹配的快捷键
   */
  private findMatchingShortcut(event: KeyboardEvent): KeyboardShortcut | undefined {
    const key = this.getEventKey(event);
    return this.shortcuts.get(key);
  }

  /**
   * 获取快捷键的唯一标识
   */
  private getShortcutKey(shortcut: Partial<KeyboardShortcut>): string {
    const parts: string[] = [];
    
    if (shortcut.ctrlKey) parts.push('ctrl');
    if (shortcut.altKey) parts.push('alt');
    if (shortcut.shiftKey) parts.push('shift');
    if (shortcut.metaKey) parts.push('meta');
    
    parts.push(shortcut.key?.toLowerCase() || '');
    
    return parts.join('+');
  }

  /**
   * 获取事件的键标识
   */
  private getEventKey(event: KeyboardEvent): string {
    const parts: string[] = [];
    
    if (event.ctrlKey) parts.push('ctrl');
    if (event.altKey) parts.push('alt');
    if (event.shiftKey) parts.push('shift');
    if (event.metaKey) parts.push('meta');
    
    parts.push(event.key.toLowerCase());
    
    return parts.join('+');
  }

  /**
   * 格式化快捷键显示文本
   */
  static formatShortcut(shortcut: KeyboardShortcut): string {
    const parts: string[] = [];
    
    // 根据操作系统显示不同的修饰键
    const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
    
    if (shortcut.ctrlKey) {
      parts.push(isMac ? '⌘' : 'Ctrl');
    }
    if (shortcut.altKey) {
      parts.push(isMac ? '⌥' : 'Alt');
    }
    if (shortcut.shiftKey) {
      parts.push(isMac ? '⇧' : 'Shift');
    }
    if (shortcut.metaKey) {
      parts.push(isMac ? '⌘' : 'Meta');
    }
    
    // 格式化按键名称
    const keyName = shortcut.key.charAt(0).toUpperCase() + shortcut.key.slice(1);
    parts.push(keyName);
    
    return parts.join(isMac ? '' : '+');
  }
}

// 导出单例实例
export const keyboardShortcuts = new KeyboardShortcutsService();