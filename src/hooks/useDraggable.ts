import { useState, useEffect, useRef } from 'react';

interface Position {
  x: number;
  y: number;
}

export function useDraggable(initialX = 100, initialY = 100) {
  const [position, setPosition] = useState<Position>({ x: initialX, y: initialY });
  const [isDragging, setIsDragging] = useState(false);
  const dragStart = useRef({ x: 0, y: 0 });
  const handleRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const handleMouseDown = (e: MouseEvent) => {
      // Only drag with left click
      if (e.button !== 0) return;
      
      const target = e.target as HTMLElement;
      // Make sure we are clicking on the handle or a child of the handle
      if (!handleRef.current || !handleRef.current.contains(target)) return;
      
      // Prevent drag on buttons or controls in the header
      if (target.closest('.btn-control') || target.closest('button')) return;

      setIsDragging(true);
      dragStart.current = {
        x: e.clientX - position.x,
        y: e.clientY - position.y
      };
      
      e.preventDefault();
    };

    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging) return;
      
      // Calculate new position
      let newX = e.clientX - dragStart.current.x;
      let newY = e.clientY - dragStart.current.y;
      
      // Bound the window within the viewport roughly
      const maxX = window.innerWidth - 100;
      const maxY = window.innerHeight - 80;
      newX = Math.max(0, Math.min(newX, maxX));
      newY = Math.max(0, Math.min(newY, maxY));

      setPosition({ x: newX, y: newY });
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    const handle = handleRef.current;
    if (handle) {
      handle.addEventListener('mousedown', handleMouseDown);
    }

    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      if (handle) {
        handle.removeEventListener('mousedown', handleMouseDown);
      }
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, position.x, position.y]);

  return { position, handleRef, setPosition };
}
