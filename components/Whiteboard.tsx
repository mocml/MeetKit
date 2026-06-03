'use client';

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useRoomContext } from '@livekit/components-react';
import { RoomEvent } from 'livekit-client';
import { Palette, Trash2, Eraser, Edit3, Circle, Undo } from 'lucide-react';

interface Stroke {
  id: string; // ID duy nhất cho toàn bộ nét vẽ dài từ lúc click đến lúc nhả chuột
  sender: string; // Tên định danh của người vẽ
  prevX: number;
  prevY: number;
  currX: number;
  currY: number;
  color: string; // Hex color or 'erase'
  size: number;
}

export function Whiteboard() {
  const room = useRoomContext();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Local drawing states
  const [color, setColor] = useState('#10b981'); // Default Emerald
  const [size, setSize] = useState(3);
  const [isEraser, setIsEraser] = useState(false);
  const isDrawingRef = useRef(false);
  const lastPointRef = useRef<{ x: number; y: number } | null>(null);
  // Stroke history for redrawing on resize
  const strokesRef = useRef<Stroke[]>([]);
  const currentStrokeIdRef = useRef<string | null>(null);
  
  // Danh sách tối đa 20 Stroke ID gần nhất của chính mình để giới hạn số lần được phép hoàn tác
  const myStrokeIdsRef = useRef<string[]>([]);

  // List of premium HSL tailored colors
  const colors = [
    { name: 'Emerald', hex: '#10b981' },
    { name: 'Sky', hex: '#0ea5e9' },
    { name: 'Red', hex: '#ef4444' },
    { name: 'Amber', hex: '#f59e0b' },
    { name: 'White', hex: '#000000' }
  ];

  // Draw a single stroke on a canvas context using rounded integer coordinates
  const drawStroke = (ctx: CanvasRenderingContext2D, stroke: Stroke, width: number, height: number) => {
    ctx.beginPath();
    ctx.lineWidth = stroke.size;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    if (stroke.color === 'erase') {
      ctx.globalCompositeOperation = 'destination-out';
      ctx.strokeStyle = 'rgba(0,0,0,1)';
    } else {
      ctx.globalCompositeOperation = 'source-over';
      ctx.strokeStyle = stroke.color;
    }

    ctx.moveTo(Math.round(stroke.prevX * width), Math.round(stroke.prevY * height));
    ctx.lineTo(Math.round(stroke.currX * width), Math.round(stroke.currY * height));
    ctx.stroke();
  };

  // Redraw all strokes in history using grouped paths for extreme clarity and performance
  const redraw = useCallback(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const rect = container.getBoundingClientRect();
    const width = Math.round(rect.width);
    const height = Math.round(rect.height);

    // Sử dụng kích thước CSS thực tế để clear vì context đã được scale theo dpr
    ctx.clearRect(0, 0, width, height);

    if (strokesRef.current.length === 0) return;

    // Nhóm các nét vẽ liền mạch để vẽ thành một Path duy nhất.
    // Điều này loại bỏ hoàn toàn việc chồng lấp các góc bo tròn (round caps), giúp nét vẽ sắc sảo, siêu nét và tăng hiệu năng.
    let currentPath: Stroke[] = [];

    const commitPath = (path: Stroke[]) => {
      if (path.length === 0) return;

      ctx.beginPath();
      ctx.lineWidth = path[0].size;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      if (path[0].color === 'erase') {
        ctx.globalCompositeOperation = 'destination-out';
        ctx.strokeStyle = 'rgba(0,0,0,1)';
      } else {
        ctx.globalCompositeOperation = 'source-over';
        ctx.strokeStyle = path[0].color;
      }

      ctx.moveTo(Math.round(path[0].prevX * width), Math.round(path[0].prevY * height));
      path.forEach((s) => {
        ctx.lineTo(Math.round(s.currX * width), Math.round(s.currY * height));
      });
      ctx.stroke();
    };

    strokesRef.current.forEach((stroke) => {
      if (currentPath.length === 0) {
        currentPath.push(stroke);
      } else {
        const last = currentPath[currentPath.length - 1];
        // Kiểm tra nét vẽ có nối tiếp và thuộc cùng một Stroke ID vẽ liền mạch hay không
        const isContiguous =
          last.id === stroke.id &&
          stroke.color === last.color &&
          stroke.size === last.size;

        if (isContiguous) {
          currentPath.push(stroke);
        } else {
          commitPath(currentPath);
          currentPath = [stroke];
        }
      }
    });

    commitPath(currentPath);
  }, []);

  // Resize canvas to fill container while keeping content crisp
  const resizeCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const rect = container.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 2;

    // Sử dụng kích thước CSS tròn số để loại bỏ hoàn toàn hiện tượng lệch sub-pixel
    const width = Math.round(rect.width);
    const height = Math.round(rect.height);

    // Thiết lập độ phân giải thực tế dựa trên devicePixelRatio để nét vẽ siêu sắc nét
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);

    // Giữ nguyên kích thước hiển thị CSS bằng các số nguyên tròn trịa
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;

    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.setTransform(1, 0, 0, 1, 0, 0); // Reset ma trận biến đổi
      ctx.scale(dpr, dpr); // Tự động nhân dọi nét vẽ theo tỉ lệ màn hình Retina/High-DPI
    }

    // Redraw strokes in the newly sized canvas
    redraw();
  }, [redraw]);

  // Handle window and container resize
  useEffect(() => {
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    // Watch for size changes of the container (e.g. sidebar opening/closing)
    const resizeObserver = new ResizeObserver(() => {
      resizeCanvas();
    });
    if (containerRef.current) {
      resizeObserver.observe(containerRef.current);
    }

    return () => {
      window.removeEventListener('resize', resizeCanvas);
      resizeObserver.disconnect();
    };
  }, [resizeCanvas]);

  // Listen for incoming drawing/clearing data over LiveKit Data Channel using the specific topic
  useEffect(() => {
    if (!room) return;

    const handleDataReceived = (payload: Uint8Array, participant?: any, kind?: any, topic?: string) => {
      // Chỉ xử lý các gói tin thuộc chủ đề whiteboard
      if (topic !== 'whiteboard') return;

      try {
        const text = new TextDecoder().decode(payload);
        const data = JSON.parse(text);

        if (data.type === 'whiteboard_draw') {
          const stroke: Stroke = {
            id: data.id,
            sender: data.sender,
            prevX: data.prevX,
            prevY: data.prevY,
            currX: data.currX,
            currY: data.currY,
            color: data.color,
            size: data.size
          };

          // Save to history
          strokesRef.current.push(stroke);

          // Draw on canvas using CSS layout dimensions
          const canvas = canvasRef.current;
          const container = containerRef.current;
          if (canvas && container) {
            const ctx = canvas.getContext('2d');
            if (ctx) {
              const rect = container.getBoundingClientRect();
              drawStroke(ctx, stroke, Math.round(rect.width), Math.round(rect.height));
            }
          }
        } else if (data.type === 'whiteboard_undo') {
          const undoId = data.strokeId;
          strokesRef.current = strokesRef.current.filter((s) => s.id !== undoId);
          redraw();
        } else if (data.type === 'whiteboard_clear') {
          strokesRef.current = [];
          myStrokeIdsRef.current = []; // Xóa hàng đợi undo của mình khi bảng vẽ bị xóa sạch
          const canvas = canvasRef.current;
          const container = containerRef.current;
          if (canvas && container) {
            const ctx = canvas.getContext('2d');
            if (ctx) {
              const rect = container.getBoundingClientRect();
              ctx.clearRect(0, 0, Math.round(rect.width), Math.round(rect.height));
            }
          }
        }
      } catch (err) {
        console.error("Failed to parse whiteboard data:", err);
      }
    };

    room.on(RoomEvent.DataReceived, handleDataReceived);
    return () => {
      room.off(RoomEvent.DataReceived, handleDataReceived);
    };
  }, [room, redraw]);

  // Publish draw stroke to all participants reliably to avoid broken lines
  const broadcastDraw = (stroke: Stroke) => {
    if (!room) return;
    const payload = JSON.stringify({
      type: 'whiteboard_draw',
      ...stroke
    });
    const data = new TextEncoder().encode(payload);

    // Sử dụng kênh truyền tin cậy (reliable: true) và phân loại theo chủ đề (topic)
    room.localParticipant.publishData(data, {
      reliable: true,
      topic: 'whiteboard'
    }).catch(console.error);
  };

  // Publish clear canvas command reliably
  const broadcastClear = () => {
    if (!room) return;
    const payload = JSON.stringify({ type: 'whiteboard_clear' });
    const data = new TextEncoder().encode(payload);

    room.localParticipant.publishData(data, {
      reliable: true,
      topic: 'whiteboard'
    }).catch(console.error);
  };

  // Handle local drawing actions
  const startDrawing = (clientX: number, clientY: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;

    isDrawingRef.current = true;
    lastPointRef.current = {
      x: x / rect.width,
      y: y / rect.height
    };
    
    // Sinh mã Stroke ID ngẫu nhiên duy nhất cho toàn bộ nét bút từ lúc click đến lúc nhả chuột
    const strokeId = Math.random().toString(36).substring(2, 9);
    currentStrokeIdRef.current = strokeId;
    
    // Lưu vào hàng đợi để hỗ trợ hoàn tác giới hạn tối đa 20 nét vẽ gần nhất
    myStrokeIdsRef.current.push(strokeId);
    if (myStrokeIdsRef.current.length > 20) {
      myStrokeIdsRef.current.shift(); // Loại bỏ nét vẽ cũ nhất ra khỏi giới hạn hoàn tác
    }
  };

  const draw = (clientX: number, clientY: number) => {
    if (!isDrawingRef.current || !lastPointRef.current || !room || !currentStrokeIdRef.current) return;
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;

    const currentPoint = {
      x: x / rect.width,
      y: y / rect.height
    };

    const stroke: Stroke = {
      id: currentStrokeIdRef.current,
      sender: room.localParticipant.identity,
      prevX: lastPointRef.current.x,
      prevY: lastPointRef.current.y,
      currX: currentPoint.x,
      currY: currentPoint.y,
      color: isEraser ? 'erase' : color,
      size: size
    };

    // Draw locally using CSS dimensions because ctx is scaled by dpr
    drawStroke(ctx, stroke, Math.round(rect.width), Math.round(rect.height));

    // Save to history
    strokesRef.current.push(stroke);

    // Broadcast to others
    broadcastDraw(stroke);

    lastPointRef.current = currentPoint;
  };

  const stopDrawing = () => {
    isDrawingRef.current = false;
    lastPointRef.current = null;
    currentStrokeIdRef.current = null;
  };

  const handleUndo = () => {
    if (!room || myStrokeIdsRef.current.length === 0) return;

    // Lấy nét vẽ gần nhất trong danh sách 20 nét vẽ của mình
    const targetStrokeId = myStrokeIdsRef.current.pop();

    if (targetStrokeId) {
      // Xóa tất cả các điểm thuộc về Stroke ID đó khỏi lịch sử cục bộ
      strokesRef.current = strokesRef.current.filter((s) => s.id !== targetStrokeId);
      // Vẽ lại bảng vẽ cục bộ
      redraw();

      // Phát đi thông điệp yêu cầu phòng họp undo Stroke ID tương ứng
      const payload = JSON.stringify({
        type: 'whiteboard_undo',
        strokeId: targetStrokeId
      });
      const data = new TextEncoder().encode(payload);
      room.localParticipant.publishData(data, {
        reliable: true,
        topic: 'whiteboard'
      }).catch(console.error);
    }
  };

  const clearCanvas = () => {
    strokesRef.current = [];
    myStrokeIdsRef.current = []; // Reset danh sách undo
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (canvas && container) {
      const ctx = canvas.getContext('2d');
      if (ctx) {
        const rect = container.getBoundingClientRect();
        ctx.clearRect(0, 0, Math.round(rect.width), Math.round(rect.height));
      }
    }
    broadcastClear();
  };

  // State to control toolbar expansion
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <div className="w-full h-full flex flex-col relative bg-white overflow-hidden select-none">
      {/* Canvas drawing container */}
      <div
        ref={containerRef}
        className="flex-1 w-full h-full relative cursor-crosshair overflow-hidden"
        onMouseDown={(e) => startDrawing(e.clientX, e.clientY)}
        onMouseMove={(e) => draw(e.clientX, e.clientY)}
        onMouseUp={stopDrawing}
        onMouseLeave={stopDrawing}

        // Touch support for iPad / mobile devices
        onTouchStart={(e) => {
          if (e.touches.length === 1) {
            startDrawing(e.touches[0].clientX, e.touches[0].clientY);
          }
        }}
        onTouchMove={(e) => {
          if (e.touches.length === 1) {
            e.preventDefault(); // Stop scrolling on drag
            draw(e.touches[0].clientX, e.touches[0].clientY);
          }
        }}
        onTouchEnd={stopDrawing}
      >
        <canvas
          ref={canvasRef}
          className="absolute inset-0 w-full h-full"
        />
      </div>

      {/* Floating interactive whiteboard toolbar (Bottom-left corner, horizontal expansion) */}
      <div
        onMouseEnter={() => setIsExpanded(true)}
        onMouseLeave={() => setIsExpanded(false)}
        onClick={() => !isExpanded && setIsExpanded(true)}
        className={`absolute bottom-5 left-5 flex items-center gap-4 bg-zinc-800/85 backdrop-blur-xl shadow-[0_12px_40px_rgba(0,0,0,0.6)] z-50 transition-all duration-350 ease-in-out cursor-pointer ${isExpanded
          ? 'px-4 py-2.5 rounded-2xl w-auto max-w-150 h-12 opacity-100'
          : 'w-12 h-12 rounded-2xl justify-center p-0 opacity-80 hover:opacity-100 hover:scale-105 active:scale-95'
          }`}
      >
        {!isExpanded ? (
          <div className="flex items-center justify-center text-emerald-400 w-full h-full" title="Open Toolbar">
            <Palette className="w-5 h-5" />
          </div>
        ) : (
          <div className="flex items-center gap-4 animate-in fade-in zoom-in-95 duration-250 w-full h-full">
            {/* Toggle Mode: Pen vs Eraser */}
            <div className="flex bg-zinc-950/60 p-0.5 rounded-lg border border-zinc-800/50 gap-0.5 items-center">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setIsEraser(false);
                }}
                className={`p-1.5 rounded-md cursor-pointer transition-colors flex justify-center ${!isEraser ? 'bg-emerald-500 text-zinc-950 shadow-md font-bold' : 'text-zinc-400 hover:text-zinc-200'}`}
                title="Pen Tool"
              >
                <Edit3 className="w-4 h-4" />
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setIsEraser(true);
                }}
                className={`p-1.5 rounded-md cursor-pointer transition-colors flex justify-center ${isEraser ? 'bg-emerald-500 text-zinc-950 shadow-md font-bold' : 'text-zinc-400 hover:text-zinc-200'}`}
                title="Eraser Tool"
              >
                <Eraser className="w-4 h-4" />
              </button>
            </div>

            {/* Color Palette (disabled in Eraser mode) */}
            <div className={`flex items-center gap-1.5 ${isEraser ? 'opacity-30 pointer-events-none' : ''}`}>
              {colors.map((c) => (
                <button
                  key={c.hex}
                  onClick={(e) => {
                    e.stopPropagation();
                    setColor(c.hex);
                  }}
                  className="w-5.5 h-5.5 rounded-full cursor-pointer border border-zinc-800 flex items-center justify-center transition-transform hover:scale-115 active:scale-95"
                  style={{ backgroundColor: c.hex }}
                  title={c.name}
                >
                  {color === c.hex && (
                    <div className="w-1.5 h-1.5 rounded-full bg-zinc-950 shadow-sm" />
                  )}
                </button>
              ))}
            </div>

            <div className="w-px h-6 bg-zinc-800" />

            {/* Size Selection */}
            <div className="flex items-center gap-2">
              {[
                { size: 3, label: 'Small' },
                { size: 6, label: 'Medium' },
                { size: 12, label: 'Large' }
              ].map((s) => (
                <button
                  key={s.size}
                  onClick={(e) => {
                    e.stopPropagation();
                    setSize(s.size);
                  }}
                  className={`p-1 rounded-md cursor-pointer text-zinc-400 hover:text-zinc-200 transition-colors flex items-center justify-center ${size === s.size ? 'bg-zinc-800 text-emerald-400 font-bold border border-zinc-750' : ''}`}
                  title={`${s.label} Brush`}
                >
                  <Circle
                    className="fill-current text-current animate-in zoom-in-50"
                    style={{ width: `${6 + s.size / 2}px`, height: `${6 + s.size / 2}px` }}
                  />
                </button>
              ))}
            </div>

            <div className="w-px h-6 bg-zinc-800" />

            {/* Action: Undo */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleUndo();
              }}
              className="p-1.5 rounded-lg text-emerald-400 hover:text-emerald-300 hover:bg-emerald-500/10 cursor-pointer transition-colors border border-transparent hover:border-emerald-500/20 flex justify-center items-center"
              title="Undo last stroke"
            >
              <Undo className="w-4 h-4" />
            </button>

            {/* Action: Clear */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                clearCanvas();
              }}
              className="p-1.5 rounded-lg text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 cursor-pointer transition-colors border border-transparent hover:border-rose-500/20 flex justify-center items-center"
              title="Clear Board"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default Whiteboard;
