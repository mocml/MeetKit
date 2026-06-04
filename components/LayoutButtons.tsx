'use client';

import React from 'react';
import { PhoneOff, ChevronDown } from 'lucide-react';

// 1. Component nút bật/tắt thanh điều hướng (Chat, Bảng trắng, Bình chọn, Thành viên, Giơ tay)
interface NavToggleButtonProps {
  onClick: () => void;
  isActive: boolean;
  icon: React.ReactNode;
  label: string;
  badge?: React.ReactNode;
  activeColor?: 'emerald' | 'amber';
}

export function NavToggleButton({
  onClick,
  isActive,
  icon,
  label,
  badge,
  activeColor = 'emerald'
}: NavToggleButtonProps) {
  const activeStyle = activeColor === 'emerald'
    ? 'bg-zinc-800/80 text-emerald-400 border-b-2 border-emerald-500 rounded-b-none'
    : 'bg-amber-500/10 text-amber-400 border-b-2 border-amber-500 rounded-b-none';

  return (
    <button
      onClick={onClick}
      className={`relative flex flex-col items-center justify-center w-12 h-11 rounded-lg transition-all cursor-pointer ${
        isActive
          ? activeStyle
          : 'text-zinc-400 hover:bg-zinc-800/50 hover:text-zinc-200'
      }`}
    >
      <div className="relative flex items-center justify-center">
        {icon}
        {badge}
      </div>
      <span className="text-[9px] mt-0.5 font-semibold">{label}</span>
    </button>
  );
}

// 2. Component nút bật/tắt thiết bị Media (Camera, Microphone, Screen Share)
interface MediaToggleButtonProps {
  onClick: () => void;
  disabled?: boolean;
  isEnabled: boolean;
  enabledIcon: React.ReactNode;
  disabledIcon?: React.ReactNode;
  activeColor?: 'normal' | 'emerald';
  inactiveColor?: 'normal' | 'rose';
}

export function MediaToggleButton({
  onClick,
  disabled = false,
  isEnabled,
  enabledIcon,
  disabledIcon,
  activeColor = 'normal',
  inactiveColor = 'rose'
}: MediaToggleButtonProps) {
  const styleNormal = 'text-zinc-200 hover:bg-zinc-700/60';
  const styleRose = 'bg-rose-600/20 text-rose-400 hover:bg-rose-600/30';
  const styleEmerald = 'bg-emerald-600/20 text-emerald-400 hover:bg-emerald-600/30';

  const getStyle = () => {
    if (isEnabled) {
      return activeColor === 'emerald' ? styleEmerald : styleNormal;
    } else {
      return inactiveColor === 'rose' ? styleRose : styleNormal;
    }
  };

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`p-2 rounded-md transition-all cursor-pointer ${getStyle()} disabled:opacity-55 disabled:cursor-not-allowed`}
    >
      {isEnabled ? enabledIcon : (disabledIcon || enabledIcon)}
    </button>
  );
}

// 3. Component nút rời phòng họp màu đỏ
interface LeaveButtonProps {
  onLeave: () => void;
  onDropdownClick?: () => void;
}

export function LeaveButton({ onLeave, onDropdownClick }: LeaveButtonProps) {
  return (
    <div className="flex items-stretch rounded-lg overflow-hidden border border-rose-500/20 shadow-md">
      <button
        onClick={onLeave}
        className="bg-[#c43131] hover:bg-[#b02929] text-white px-3.5 py-1.5 text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
      >
        <PhoneOff className="w-3.5 h-3.5" />
        <span>Leave</span>
      </button>
      <button
        onClick={onDropdownClick}
        className="bg-[#b32b2b] hover:bg-[#a12424] text-white px-1.5 py-1.5 transition-colors border-l border-white/10 flex items-center justify-center cursor-pointer"
      >
        <ChevronDown className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}
