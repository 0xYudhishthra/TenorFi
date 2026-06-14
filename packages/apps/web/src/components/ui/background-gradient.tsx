"use client";

import { cn } from "@/lib/utils";
import React from "react";
import { motion } from "framer-motion";

/**
 * BackgroundGradient (Aceternity-style) tuned to the TenorFi palette:
 * a navy-dominant animated glow with a warm clay highlight — not the
 * default rainbow. Set the corner radius via `containerClassName`
 * (e.g. "rounded-full"); the glow inherits it.
 */
export const BackgroundGradient = ({
  children,
  className,
  containerClassName,
  animate = true,
}: {
  children?: React.ReactNode;
  className?: string;
  containerClassName?: string;
  animate?: boolean;
}) => {
  const variants = {
    initial: { backgroundPosition: "0 50%" },
    animate: { backgroundPosition: ["0, 50%", "100% 50%", "0 50%"] },
  };

  // TenorFi brand glow: clay (warm) + navy tones, dark navy center.
  const gradient =
    "bg-[radial-gradient(circle_farthest-side_at_0_100%,#C0823A,transparent),radial-gradient(circle_farthest-side_at_100%_0,#2B4A78,transparent),radial-gradient(circle_farthest-side_at_100%_100%,#5E7BA6,transparent),radial-gradient(circle_farthest-side_at_0_0,#2B4A78,#1A2E4C)]";

  const transition = animate
    ? { duration: 5, repeat: Infinity, repeatType: "reverse" as const }
    : undefined;

  return (
    <div className={cn("relative p-[3px] group rounded-3xl", containerClassName)}>
      <motion.div
        variants={animate ? variants : undefined}
        initial={animate ? "initial" : undefined}
        animate={animate ? "animate" : undefined}
        transition={transition}
        style={{ backgroundSize: animate ? "400% 400%" : undefined, borderRadius: "inherit" }}
        className={cn(
          "absolute inset-0 z-[1]opacity-60 blur-lg transition duration-500 will-change-transform group-hover:opacity-100",
          gradient
        )}
      />
      <motion.div
        variants={animate ? variants : undefined}
        initial={animate ? "initial" : undefined}
        animate={animate ? "animate" : undefined}
        transition={transition}
        style={{ backgroundSize: animate ? "400% 400%" : undefined, borderRadius: "inherit" }}
        className={cn(
          "absolute inset-0 z-[1]will-change-transform",
          gradient
        )}
      />
      <div className={cn("relative z-10", className)}>{children}</div>
    </div>
  );
};
