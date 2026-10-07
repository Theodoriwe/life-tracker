"use client";

import * as React from "react";
import * as SliderPrimitive from "@radix-ui/react-slider";

import { cn } from "./utils";

function hexToRgba(hex: string, alpha = 1) {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? h.split('').map(c => c + c).join('') : h;
  const bigint = parseInt(full, 16);
  const r = (bigint >> 16) & 255;
  const g = (bigint >> 8) & 255;
  const b = bigint & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function Slider({
  className,
  defaultValue,
  value,
  min = 0,
  max = 100,
  style,
  hint,
  allowTrackClick = false,
  ...props
}: React.ComponentProps<typeof SliderPrimitive.Root> & { style?: React.CSSProperties; hint?: React.ReactNode; allowTrackClick?: boolean }) {
  const _values = React.useMemo(
    () =>
      Array.isArray(value)
        ? value
        : Array.isArray(defaultValue)
          ? defaultValue
          : [min, max],
    [value, defaultValue, min, max],
  );

  // Extract custom slider color from style (cast to any for CSS variable access)
  const s = style as any;
  const sliderColor = (s?.["--slider-range-color"] as string) || "#1A1A2E";

  const rootHeight = (s?.height as string) ?? "48px";
  const trackHeight = (s?.["--slider-track-height"] as string) ?? rootHeight;
  const thumbSize = (s?.["--slider-thumb-size"] as string) ?? rootHeight;
  const borderRadius = trackHeight;

  return (
    <SliderPrimitive.Root
      data-slot="slider"
      defaultValue={defaultValue}
      value={value}
      min={min}
      max={max}
      className={cn(
        "relative flex w-full touch-none items-center select-none rounded-full overflow-hidden data-[disabled]:opacity-50 data-[orientation=vertical]:h-full data-[orientation=vertical]:min-h-44 data-[orientation=vertical]:w-auto data-[orientation=vertical]:flex-col",
        className,
      )}
      style={{
        ...style,
        height: rootHeight,
      }}
      {...props}
    >
      <SliderPrimitive.Track
        data-slot="slider-track"
        className="relative grow w-full"
        onPointerDown={(event) => {
          if (!allowTrackClick) {
            event.preventDefault();
            event.stopPropagation();
          }
        }}
        onClick={(event) => {
          if (!allowTrackClick) {
            event.preventDefault();
            event.stopPropagation();
          }
        }}
        style={{
          height: trackHeight,
          backgroundColor: hexToRgba(sliderColor, 0.12),
          borderRadius: borderRadius,
          overflow: "hidden",
          boxSizing: "border-box",
          WebkitBorderRadius: borderRadius,
          WebkitBackgroundClip: "padding-box",
          backgroundClip: "padding-box",
        }}
      >
        <SliderPrimitive.Range
          data-slot="slider-range"
          className="absolute h-full rounded-full"
          style={{
            backgroundColor: sliderColor,
            borderRadius: borderRadius,
            overflow: "hidden",
            boxSizing: "border-box",
            WebkitBorderRadius: borderRadius,
            WebkitBackgroundClip: "padding-box",
            backgroundClip: "padding-box",
          }}
        />
      </SliderPrimitive.Track>
      {/* Hint overlay centered on the track */}
      {hint && (
        <div className="absolute left-0 right-0 top-1/2 -translate-y-1/2 flex justify-center pointer-events-none z-10">
          {hint}
        </div>
      )}
      {Array.from({ length: _values.length }, (_, index) => (
        <SliderPrimitive.Thumb
          data-slot="slider-thumb"
          key={index}
          className="block rounded-full border-2 shadow-md transition-all hover:shadow-lg focus-visible:outline-hidden disabled:pointer-events-none disabled:opacity-50 absolute"
          style={{
            width: thumbSize,
            height: thumbSize,
            borderColor: sliderColor,
            backgroundColor: "white",
            boxShadow: `0 4px 12px ${sliderColor}60`,
            top: "50%",
            left: "0",
            transform: "translate(-50%, -50%)",
            pointerEvents: "auto",
          }}
        />
      ))}
    </SliderPrimitive.Root>
  );
}

export { Slider };
