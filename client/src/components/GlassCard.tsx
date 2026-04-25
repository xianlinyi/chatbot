import React, { useRef, useState, useEffect, ReactNode } from 'react';
import './GlassCard.css';

interface GlassCardProps {
  children: ReactNode;
  maxHeight?: string | number;
  className?: string;
}

export const GlassCard: React.FC<GlassCardProps> = ({
  children,
  maxHeight = 400,
  className = ''
}) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [isTop, setIsTop] = useState(true);
  const [isBottom, setIsBottom] = useState(false);
  const [isScrollable, setIsScrollable] = useState(false);

  const checkScroll = () => {
    if (scrollRef.current) {
      const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
      setIsTop(scrollTop <= 0);
      // 容差1px以处理不同屏幕缩放下的浮点数计算误差
      setIsBottom(Math.ceil(scrollTop + clientHeight) >= scrollHeight - 1);
      setIsScrollable(scrollHeight > clientHeight);
    }
  };

  useEffect(() => {
    checkScroll();
    window.addEventListener('resize', checkScroll);
    return () => window.removeEventListener('resize', checkScroll);
  }, [children]);

  // 根据滚动位置决定渐变遮罩类的使用
  let maskClass = 'glass-card-mask-none';
  if (isScrollable) {
    if (isTop && !isBottom) maskClass = 'glass-card-mask-bottom';
    else if (!isTop && isBottom) maskClass = 'glass-card-mask-top';
    else if (!isTop && !isBottom) maskClass = 'glass-card-mask-both';
  }

  return (
    <div className={`glass-card-container ${className}`} style={{ maxHeight }}>
      <div
        className={`glass-card-scroll-area ${maskClass}`}
        ref={scrollRef}
        onScroll={checkScroll}
        style={{ maxHeight }}
      >
        {children}
      </div>
    </div>
  );
};
