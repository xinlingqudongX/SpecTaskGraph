/**
 * 响应式设计工具类
 * 提供屏幕尺寸检测和响应式布局工具
 */

export interface BreakpointConfig {
  xs: number;
  sm: number;
  md: number;
  lg: number;
  xl: number;
}

export type BreakpointName = keyof BreakpointConfig;

export interface ViewportInfo {
  width: number;
  height: number;
  breakpoint: BreakpointName;
  isMobile: boolean;
  isTablet: boolean;
  isDesktop: boolean;
  orientation: 'portrait' | 'landscape';
}

export class ResponsiveUtils {
  private static readonly DEFAULT_BREAKPOINTS: BreakpointConfig = {
    xs: 0,
    sm: 576,
    md: 768,
    lg: 1024,
    xl: 1200,
  };

  private breakpoints: BreakpointConfig;
  private listeners: Set<(viewport: ViewportInfo) => void> = new Set();
  private currentViewport: ViewportInfo;

  constructor(breakpoints?: Partial<BreakpointConfig>) {
    this.breakpoints = { ...ResponsiveUtils.DEFAULT_BREAKPOINTS, ...breakpoints };
    this.currentViewport = this.getViewportInfo();
    this.bindEvents();
  }

  /**
   * 获取当前视口信息
   */
  getViewportInfo(): ViewportInfo {
    const width = window.innerWidth;
    const height = window.innerHeight;
    const breakpoint = this.getCurrentBreakpoint(width);
    
    return {
      width,
      height,
      breakpoint,
      isMobile: breakpoint === 'xs' || breakpoint === 'sm',
      isTablet: breakpoint === 'md',
      isDesktop: breakpoint === 'lg' || breakpoint === 'xl',
      orientation: width > height ? 'landscape' : 'portrait',
    };
  }

  /**
   * 获取当前断点
   */
  getCurrentBreakpoint(width: number = window.innerWidth): BreakpointName {
    const breakpointEntries = Object.entries(this.breakpoints)
      .sort(([, a], [, b]) => b - a);

    for (const [name, minWidth] of breakpointEntries) {
      if (width >= minWidth) {
        return name as BreakpointName;
      }
    }

    return 'xs';
  }

  /**
   * 添加视口变化监听器
   */
  addListener(callback: (viewport: ViewportInfo) => void): void {
    this.listeners.add(callback);
  }

  /**
   * 移除视口变化监听器
   */
  removeListener(callback: (viewport: ViewportInfo) => void): void {
    this.listeners.delete(callback);
  }

  /**
   * 获取面板宽度配置
   */
  getPanelWidth(): number {
    const viewport = this.getViewportInfo();
    if (viewport.isMobile) return 280;
    if (viewport.isTablet) return 320;
    if (viewport.breakpoint === 'xl') return 380;
    return 350;
  }

  /**
   * 检查是否支持触摸
   */
  isTouchDevice(): boolean {
    return 'ontouchstart' in window || navigator.maxTouchPoints > 0;
  }

  /**
   * 检查是否是移动设备
   */
  isMobileDevice(): boolean {
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
  }

  /**
   * 销毁实例
   */
  destroy(): void {
    window.removeEventListener('resize', this.handleResize);
    window.removeEventListener('orientationchange', this.handleOrientationChange);
    this.listeners.clear();
  }

  /**
   * 绑定事件监听器
   */
  private bindEvents(): void {
    window.addEventListener('resize', this.handleResize.bind(this));
    window.addEventListener('orientationchange', this.handleOrientationChange.bind(this));
  }

  /**
   * 处理窗口大小变化
   */
  private handleResize = (): void => {
    const newViewport = this.getViewportInfo();
    
    // 只有当断点发生变化时才触发回调
    if (newViewport.breakpoint !== this.currentViewport.breakpoint ||
        newViewport.orientation !== this.currentViewport.orientation) {
      this.currentViewport = newViewport;
      this.notifyListeners();
    } else {
      this.currentViewport = newViewport;
    }
  }

  /**
   * 处理屏幕方向变化
   */
  private handleOrientationChange = (): void => {
    // 延迟处理，等待屏幕方向变化完成
    setTimeout(() => {
      this.handleResize();
    }, 100);
  }

  /**
   * 通知所有监听器
   */
  private notifyListeners(): void {
    this.listeners.forEach(callback => {
      try {
        callback(this.currentViewport);
      } catch (error) {
        console.error('响应式监听器执行错误:', error);
      }
    });
  }
}

// 导出单例实例
export const responsiveUtils = new ResponsiveUtils();

// 导出Vue组合式API
export function useResponsive() {
  const viewport = responsiveUtils.getViewportInfo();
  
  return {
    viewport,
    isMobile: viewport.isMobile,
    isTablet: viewport.isTablet,
    isDesktop: viewport.isDesktop,
    getPanelWidth: () => responsiveUtils.getPanelWidth(),
    isTouchDevice: () => responsiveUtils.isTouchDevice(),
    isMobileDevice: () => responsiveUtils.isMobileDevice(),
  };
}